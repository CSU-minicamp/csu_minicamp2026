import assert from "node:assert/strict";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const participant = (id, status = "已录取") => ({
  id, status, registration_type: "contestant", registrationType: "contestant",
  name: id, studentId: "202600000" + id.charCodeAt(0), college: "CS", major: "SE",
  grade: "大二", phone: "13800000000", email: id + "@example.com", motivation: "Build",
  teamId: "TEAM 01", teamCode: "MC26-TEAM", skills: []
});
const roadshow = {
  name: "Visitor", phone: "13900000000", email: "visitor@example.com", registration_type: "roadshow",
  identity_type: "其他在校生", school_or_company: "CSU", grade_or_position: "Student",
  attend_roadshow: false, receive_notifications: false
};

function fixture() {
  const db = {
    config: { applicationOpen: true, teamConfirmOpen: true },
    applications: [participant("A"), participant("B"), participant("C"), participant("D")],
    teams: [{ id: "TEAM 01", ownerId: "A", code: "MC26-TEAM", memberIds: ["A", "B", "C", "D"], locked: false, published: false }],
    sessions: Object.fromEntries(["A", "B", "C", "D"].map(id => [id, { role: "participant", userId: id }])),
    notices: [], projects: [], votes: [], ideas: []
  };
  // 问答存储独立成表，本套测试只覆盖报名 / 组队 / 投票路由，这里注入内存替身。
  const qaStub = {
    initialize: async () => {},
    list: () => [],
    listPublic: () => [],
    stats: () => ({ total: 0, pending: 0, answered: 0, pinned: 0, hidden: 0 }),
    mode: () => "memory",
    createQuestion: async () => ({ error: "qa store disabled in this test", status: 500 }),
    answerQuestion: async () => ({ error: "qa store disabled in this test", status: 500 }),
    setStatus: async () => ({ error: "qa store disabled in this test", status: 500 })
  };
  // Execute the real routes without starting HTTP or loading/saving either database.
  const context = vm.createContext({ crypto, console, process, fixtureDb: db, qaPath: "/tmp/minicamp-qa-test.json", createQaStore: () => qaStub, QA_STATUSES: ["pinned", "answered", "pending", "hidden"] });
  vm.runInContext(source.slice(source.indexOf("const adminPassword"), source.indexOf("async function serve(")) +
    "\ndb=fixtureDb; saveDb=async()=>{}; globalThis.routes=api; globalThis.normalize=normalizeTeams; globalThis.normalizeApplications=normalizeApplications;", context);
  async function request(method, pathname, token = "", payload) {
    const req = new EventEmitter();
    req.method = method;
    req.headers = { authorization: "Bearer " + token };
    let status, data;
    const result = context.routes(req, {
      writeHead(code) { status = code; },
      end(raw) { data = JSON.parse(raw); }
    }, new URL(pathname, "http://localhost"));
    req.emit("data", JSON.stringify(payload || {}));
    req.emit("end");
    await result;
    return { status, data };
  }
  return { db, request, normalize: context.normalize, normalizeApplications: context.normalizeApplications };
}

const legacyMember = extra => ({
  id: "MC26-2000", status: "已录取", registration_type: "contestant", registrationType: "contestant",
  name: "老数据同学", studentId: "2026000099", college: "CS", phone: "13800000099",
  email: "legacy@example.com", motivation: "Build", teamId: "", teamCode: "", skills: [],
  ...extra
});

const addFreeOwner = db => {
  db.applications.push(legacyMember({id: "MC26-2001", name: "队长", studentId: "2026000098", major: "Software Engineering", grade: "大三", phone: "13800000098", email: "owner@example.com"}));
  db.sessions.OWNER = { role: "participant", userId: "MC26-2001" };
};

test("registration cannot overwrite an existing identity or its session", async () => {
  const { db, request } = fixture();
  db.config.applicationDeadline = "2000-01-01";
  const result = await request("POST", "/api/applications", "", { ...roadshow, id: "B" });
  assert.equal(result.status, 201);
  assert.match(result.data.application.id, /^RO-\d{4}-\d{6}$/);
  assert.equal((await request("GET", "/api/me", "B")).data.participant.name, "B");
  db.config.applicationDeadline = null;
  db.applications.push({ ...participant("MC26-9000"), teamId: "" });
  const contestant = await request("POST", "/api/applications", "", { ...participant("E"), id: "B" });
  assert.equal(contestant.status, 201);
  assert.equal(contestant.data.application.id, "MC26-9001");
});

test("roadshow and contestant registrations coexist but duplicates within each type fail", async () => {
  const { request } = fixture();
  assert.equal((await request("POST", "/api/applications", "", roadshow)).status, 201);
  const payload = { ...participant("E"), email: roadshow.email, phone: roadshow.phone };
  assert.equal((await request("POST", "/api/applications", "", payload)).status, 201);
  assert.equal((await request("POST", "/api/applications", "", payload)).status, 409);
  assert.equal((await request("POST", "/api/applications", "", roadshow)).status, 409);
});

test("roadshow profile saves canonical fields and preserves notification choices", async () => {
  const { request } = fixture();
  const { data: { token } } = await request("POST", "/api/applications", "", roadshow);
  const { attend_roadshow, receive_notifications, ...payload } = roadshow;
  const result = await request("PATCH", "/api/me", token, { ...payload, school_or_company: "Updated", grade_or_position: "Researcher" });
  assert.equal(result.status, 200);
  assert.equal(result.data.participant.school_or_company, "Updated");
  assert.equal(result.data.participant.grade_or_position, "Researcher");
  assert.equal(result.data.participant.attend_roadshow, false);
  assert.equal(result.data.participant.receive_notifications, false);
  assert.equal((await request("PATCH", "/api/me", token, { ...payload, grade_or_position: " " })).status, 400);
});

test("departing owner hands control to a remaining member and loses access", async () => {
  const { db, request } = fixture();
  assert.equal((await request("POST", "/api/teams/TEAM%2001/leave", "A")).status, 200);
  assert.equal(db.teams[0].ownerId, "B");
  assert.equal((await request("PATCH", "/api/teams/TEAM%2001/recruit", "A")).status, 403);
  assert.equal((await request("PATCH", "/api/teams/TEAM%2001/lock", "A")).status, 403);
  assert.equal((await request("PATCH", "/api/teams/TEAM%2001/recruit", "B")).status, 200);
  assert.equal((await request("PATCH", "/api/teams/TEAM%2001/lock", "B")).status, 200);
});

test("team migration repairs an owner who is no longer a member", () => {
  const { db, normalize } = fixture();
  db.teams[0].ownerId = "OUTSIDER";
  normalize();
  assert.equal(db.teams[0].ownerId, "A");
});

test("both accepted statuses can confirm teams and profile edits require review", async () => {
  for (const status of ["已录取", "已通过"]) {
    const { db, request } = fixture();
    db.applications[1].status = status;
    assert.equal((await request("PATCH", "/api/teams/TEAM%2001/lock", "A")).status, 200);
    const result = await request("PATCH", "/api/me", "B", { ...participant("B"), registration_type: "roadshow" });
    assert.equal(result.status, 200);
    assert.equal(result.data.participant.status, "待复审");
    assert.equal(result.data.participant.registration_type, "contestant");
  }
});

test("confirmation gate and roadshow team restrictions remain enforced", async () => {
  const { db, request } = fixture();
  db.config.teamConfirmOpen = false;
  assert.equal((await request("PATCH", "/api/teams/TEAM%2001/lock", "A")).status, 403);
  const { data: { token } } = await request("POST", "/api/applications", "", roadshow);
  assert.equal((await request("POST", "/api/teams", token, { project: "No" })).status, 403);
});

test("roadshow registrations stay 已通过 and cannot be restatused from admin", async () => {
  const { db, request } = fixture();
  db.sessions.ADMIN = { role: "admin", userId: "ADMIN" };
  const created = await request("POST", "/api/applications", "", roadshow);
  assert.equal(created.status, 201);
  const id = created.data.application.id;
  assert.equal(created.data.application.status, "已通过");
  const rejected = await request("PATCH", "/api/admin/applications", "ADMIN", { id, status: "未通过" });
  assert.equal(rejected.status, 403);
  assert.equal(db.applications.find(item => item.id === id).status, "已通过");
  // 重复提交同一状态仍然允许（不触发锁定分支）。
  assert.equal((await request("PATCH", "/api/admin/applications", "ADMIN", { id, status: "已通过" })).status, 200);
  // 参赛报名者不受影响，管理员仍可调整状态。
  const contestant = participant("MC26-9100", "待审核");
  db.applications.push(contestant);
  assert.equal((await request("PATCH", "/api/admin/applications", "ADMIN", { id: contestant.id, status: "已录取" })).status, 200);
});

test("public voters identify by 姓名 + 报名编号 instead of 学号", async () => {
  const { db, request } = fixture();
  db.config.voteOpen = true;
  db.sessions.ADMIN = { role: "admin", userId: "ADMIN" };
  db.projects.push({ id: "PROJECT-X1", teamId: "TEAM ORPHAN", projectName: "X1", status: "published" });
  db.projects.push({ id: "PROJECT-X2", teamId: "TEAM ORPHAN", projectName: "X2", status: "published" });
  db.projects.push({ id: "PROJECT-X3", teamId: "TEAM ORPHAN", projectName: "X3", status: "published" });
  const roadshowCode = (await request("POST", "/api/applications", "", roadshow)).data.application.id;
  const participantCode = (await request("POST", "/api/applications", "", participant("E"))).data.application.id;

  // 学号不再是身份凭据，编号格式也要校验
  const legacy = await request("POST", "/api/auth/voter", "", { name: "投票人", studentId: "2026000001" });
  assert.equal(legacy.status, 400);
  assert.match(legacy.data.error, /报名编号/);
  assert.equal((await request("POST", "/api/auth/voter", "", { name: "投票人", code: "随便写的" })).status, 400);

  // 参赛编号与路演编号都能进入投票，会话里保存姓名 + 编号
  for (const code of [participantCode, roadshowCode]) {
    const login = await request("POST", "/api/auth/voter", "", { name: "投票人", code });
    assert.equal(login.status, 200);
    assert.equal(login.data.voter.name, "投票人");
    assert.equal(login.data.voter.code, code.replace(/-/g, ""));
  }

  // 真正的投票记录会带上报名编号
  const login = await request("POST", "/api/auth/voter", "", { name: "投票人", code: participantCode });
  const stored = db.sessions[login.data.token];
  const selections = [];
  for (const award of ["Best Overall", "Best Product", "Best Design", "Best Technical", "Most Unexpected"]) {
    selections.push({ award, projectId: "PROJECT-X1", points: 3 });
    selections.push({ award, projectId: "PROJECT-X2", points: 2 });
    selections.push({ award, projectId: "PROJECT-X3", points: 1 });
  }
  selections.push({ award: "People's Choice", projectId: "PROJECT-X1", points: 1 });
  assert.equal((await request("POST", "/api/votes", login.data.token, { selections })).status, 201);
  const submittedVote = db.votes[db.votes.length - 1];
  assert.equal(submittedVote.voterCode, participantCode.replace(/-/g, ""));
  assert.equal((await request("POST", "/api/auth/voter", "", { name: "投票人", code: participantCode })).data.hasVoted, true);

  // 后台汇总按编号展示：新票读 vote 上的编号，历史大众票靠去重哈希回查会话
  submittedVote.voterCode = "";
  db.votes.push({ id: "VOTE-LEGACY", role: "participant", voterId: stored.userId, voterCode: "", voterCredentialHash: stored.credentialHash, voterIdentityHash: stored.userId, selections: [], createdAt: new Date().toISOString() });
  db.votes.push({ id: "VOTE-ME", role: "participant", voterId: participantCode, voterCode: participantCode, voterCredentialHash: null, voterIdentityHash: null, selections: [], createdAt: new Date().toISOString() });
  const summary = await request("GET", "/api/admin/summary", "ADMIN");
  const expected = participantCode.replace(/-/g, "");
  assert.equal(summary.data.votes.find(item => item.id === submittedVote.id).voterCode, expected);
  assert.equal(summary.data.votes.find(item => item.id === "VOTE-LEGACY").voterCode, expected);
  assert.equal(summary.data.votes.find(item => item.id === "VOTE-ME").voterCode, expected);
});

test("legacy members without a grade field can still be invited to a pre-team", async () => {
  const { db, request } = fixture();
  addFreeOwner(db);
  db.applications.push(legacyMember({major: "Software Engineering"}));
  const created = await request("POST", "/api/teams", "OWNER", { project: "Legacy team", memberIds: "MC26-2000" });
  assert.equal(created.status, 201);
  assert.deepEqual(created.data.team.members.map(member => member.id).sort(), ["MC26-2000", "MC26-2001"]);
});

test("members still have to be identifiable", async () => {
  const { db, request } = fixture();
  addFreeOwner(db);
  db.applications.push(legacyMember({major: "Software Engineering", studentId: "", phone: ""}));
  const rejected = await request("POST", "/api/teams", "OWNER", { project: "Legacy team", memberIds: "MC26-2000" });
  assert.equal(rejected.status, 400);
  assert.match(rejected.data.error, /member profile incomplete: MC26-2000 缺少 学号、手机号/);
});

test("applications with a legacy combined major keep their grade after migration", () => {
  const { db, normalizeApplications } = fixture();
  db.applications.push(legacyMember({major: "软件工程 · 大三"}));
  normalizeApplications();
  const migrated = db.applications.find(item => item.id === "MC26-2000");
  assert.equal(migrated.major, "软件工程");
  assert.equal(migrated.grade, "大三");
});
