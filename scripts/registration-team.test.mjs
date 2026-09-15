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
  // Execute the real routes without starting HTTP or loading/saving either database.
  const context = vm.createContext({ crypto, console, fixtureDb: db });
  vm.runInContext(source.slice(source.indexOf("const seed ="), source.indexOf("async function serve(")) +
    "\ndb=fixtureDb; saveDb=async()=>{}; globalThis.routes=api; globalThis.normalize=normalizeTeams;", context);
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
  return { db, request, normalize: context.normalize };
}

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
