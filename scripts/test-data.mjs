import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = path.join(root, "data", "minicamp.json");
const action = process.argv[2];
const mysqlConfig = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "minicamp2026",
  charset: "utf8mb4"
};

if (!["seed", "clear"].includes(action)) {
  console.error("用法：node scripts/test-data.mjs <seed|clear>");
  process.exit(1);
}

const clone = value => JSON.parse(JSON.stringify(value));
const emptyState = () => ({
  config: {
    eventName: "minicamp 2026", date: "2026-09-26/27", venue: "CSU Information Building 508",
    applicationOpen: true, applicationDeadline: "2026-09-05T23:59:00+08:00",
    resultDate: "2026-09-08T18:00:00+08:00", themeReveal: "Day 1 09:45",
    voteStartAt: null, voteOpen: false, juryWeight: 40, participantWeight: 60, starterPack: {}
  },
  applications: [], teams: [], ideas: [], projects: [], notices: [], votes: [], sessions: {}
});

async function openStore() {
  try {
    const bootstrap = await mysql.createConnection({
      host: mysqlConfig.host, port: mysqlConfig.port, user: mysqlConfig.user, password: mysqlConfig.password
    });
    await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${mysqlConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await bootstrap.end();
    const pool = mysql.createPool(mysqlConfig);
    await pool.query("CREATE TABLE IF NOT EXISTS app_state (state_key VARCHAR(64) NOT NULL PRIMARY KEY, state_json JSON NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB");
    const [rows] = await pool.query("SELECT state_json FROM app_state WHERE state_key = 'main'");
    const state = rows.length ? (typeof rows[0].state_json === "string" ? JSON.parse(rows[0].state_json) : rows[0].state_json) : emptyState();
    return {
      state,
      kind: "MySQL",
      save: async value => {
        await pool.query("INSERT INTO app_state (state_key, state_json) VALUES ('main', ?) ON DUPLICATE KEY UPDATE state_json = VALUES(state_json)", [JSON.stringify(value)]);
        await pool.end();
      }
    };
  } catch {
    let state = emptyState();
    try { state = JSON.parse(await fs.readFile(dbPath, "utf8")); } catch {}
    return {
      state,
      kind: "JSON",
      save: async value => {
        await fs.mkdir(path.dirname(dbPath), { recursive: true });
        await fs.writeFile(dbPath, JSON.stringify(value, null, 2), "utf8");
      }
    };
  }
}

function normalize(state) {
  for (const key of ["applications", "teams", "ideas", "projects", "notices", "votes"]) {
    if (!Array.isArray(state[key])) state[key] = [];
  }
  if (!state.sessions || typeof state.sessions !== "object") state.sessions = {};
  if (!state.config || typeof state.config !== "object") state.config = emptyState().config;
  return state;
}

function removeFixtures(state) {
  const fixtureApplicationIds = new Set(state.applications.filter(item => item.testFixture).map(item => item.id));
  const count = {
    applications: fixtureApplicationIds.size,
    teams: state.teams.filter(item => item.testFixture).length,
    ideas: state.ideas.filter(item => item.testFixture).length,
    projects: state.projects.filter(item => item.testFixture).length,
    notices: state.notices.filter(item => item.testFixture).length,
    votes: state.votes.filter(item => item.testFixture || fixtureApplicationIds.has(item.voterId)).length
  };
  state.applications = state.applications.filter(item => !item.testFixture);
  state.teams = state.teams.filter(item => !item.testFixture);
  state.ideas = state.ideas.filter(item => !item.testFixture);
  state.projects = state.projects.filter(item => !item.testFixture);
  state.notices = state.notices.filter(item => !item.testFixture);
  state.votes = state.votes.filter(item => !item.testFixture && !fixtureApplicationIds.has(item.voterId));
  for (const [token, session] of Object.entries(state.sessions)) {
    if (session.testFixture || fixtureApplicationIds.has(session.userId)) delete state.sessions[token];
  }
  if (state.testFixtures?.configBefore) state.config = clone(state.testFixtures.configBefore);
  delete state.testFixtures;
  return count;
}

const fixture = value => ({ ...value, testFixture: true });
const testId = number => `TEST-APP-${String(number).padStart(2, "0")}`;
const teamId = number => `TEST-TEAM-${String(number).padStart(2, "0")}`;
const projectId = number => `TEST-PROJECT-${String(number).padStart(2, "0")}`;
const timestamp = number => `2026-09-${String(10 + number).padStart(2, "0")}T${String(9 + number % 8).padStart(2, "0")}:00:00+08:00`;

const people = [
  ["林未", "计算机学院", "软件工程 · 大三", ["DEV", "AI/DATA"]],
  ["陈星", "建筑与艺术学院", "视觉传达 · 大二", ["DESIGN", "CREATIVE"]],
  ["周航", "自动化学院", "自动化 · 大三", ["HARDWARE", "DEV"]],
  ["许言", "商学院", "工商管理 · 大二", ["BUSINESS", "PRODUCT"]],
  ["沈知", "湘雅医学院", "临床医学 · 大三", ["RESEARCH", "PRODUCT"]],
  ["唐果", "文学与新闻传播学院", "数字出版 · 大二", ["CREATIVE", "DESIGN"]],
  ["宋临", "计算机学院", "人工智能 · 大四", ["AI/DATA", "DEV"]],
  ["蒋宁", "地球科学与信息物理学院", "地理信息科学 · 大三", ["RESEARCH", "DEV"]],
  ["韩青", "交通运输工程学院", "交通运输 · 大二", ["PRODUCT", "DESIGN"]],
  ["顾漫", "材料科学与工程学院", "材料科学 · 大三", ["HARDWARE", "RESEARCH"]],
  ["魏然", "法学院", "法学 · 大二", ["PRODUCT", "BUSINESS"]],
  ["罗一", "数学与统计学院", "统计学 · 大三", ["AI/DATA", "RESEARCH"]],
  ["方舟", "能源科学与工程学院", "新能源科学 · 大二", ["HARDWARE", "DEV"]],
  ["叶晓", "外国语学院", "英语 · 大三", ["CREATIVE", "PRODUCT"]],
  ["陆川", "土木工程学院", "工程管理 · 大四", ["BUSINESS", "DESIGN"]],
  ["王语", "计算机学院", "软件工程 · 大二", ["DEV", "PRODUCT"]],
  ["夏禾", "艺术学院", "环境设计 · 大三", ["DESIGN", "CREATIVE"]],
  ["秦川", "自动化学院", "智能制造 · 大二", ["HARDWARE", "AI/DATA"]]
];

const teamDefinitions = [
  ["夜航指南", "让夜间校园出行更安心", "Campus Safety", "NightPath"],
  ["无障碍食堂", "让每个人都更容易找到适合自己的餐食", "Build for Humans", "Food For All"],
  ["实验室空位", "实时发现可用的学习和实验空间", "Reimagine Campus", "LabLens"],
  ["碳足迹日历", "将日常选择转化为低碳行动", "Create the Unexpected", "Green Habit"],
  ["校友问答机", "把校园经验连接到每一个新问题", "Build for Humans", "Ask CSU"],
  ["旧物循环地图", "发现身边可交换和可再利用的物品", "Reimagine Campus", "Second Loop"]
];

function createFixtures(state) {
  const configBefore = clone(state.config);
  const applications = people.map((person, index) => {
    const number = index + 1;
    const group = Math.floor(index / 3) + 1;
    return fixture({
      id: testId(number), name: person[0], studentId: `202600${String(number).padStart(4, "0")}`,
      college: person[1], major: person[2], phone: `1390000${String(1000 + number).slice(-4)}`,
      email: `test-${String(number).padStart(2, "0")}@minicamp.local`, entryType: "个人报名",
      teamCode: `TEST-${String(group).padStart(2, "0")}`, skills: person[3],
      motivation: `【测试数据】${person[0]}希望和不同背景的同学一起完成一个可用的校园作品。`,
      experience: "【测试数据】课程项目、社团活动与个人练习作品。",
      portfolio: `https://example.com/test-${number}`, askMeAbout: "产品思路与校园场景",
      canHelpWith: "快速完成可演示的原型", explore: "跨学科协作与 AI Coding",
      status: "已录取", teamId: teamId(group), createdAt: timestamp(number), updatedAt: timestamp(number + 1)
    });
  });
  applications.push(
    fixture({ id: testId(19), name: "待审核同学", studentId: "2026000019", college: "公共管理学院", major: "行政管理 · 大二", phone: "1390001019", email: "test-pending@minicamp.local", entryType: "个人报名", teamCode: "", skills: ["PRODUCT"], motivation: "【测试数据】等待审核的报名。", experience: "", portfolio: "", askMeAbout: "校园服务", canHelpWith: "用户访谈", explore: "产品设计", status: "待审核", teamId: "", createdAt: timestamp(19) }),
    fixture({ id: testId(20), name: "候补同学", studentId: "2026000020", college: "资源与安全工程学院", major: "安全工程 · 大三", phone: "1390001020", email: "test-waitlist@minicamp.local", entryType: "个人报名", teamCode: "", skills: ["HARDWARE"], motivation: "【测试数据】候补报名。", experience: "", portfolio: "", askMeAbout: "硬件原型", canHelpWith: "传感器", explore: "智能硬件", status: "候补", teamId: "", createdAt: timestamp(20) }),
    fixture({ id: testId(21), name: "待复审同学", studentId: "2026000021", college: "冶金与环境学院", major: "环境工程 · 大二", phone: "1390001021", email: "test-review@minicamp.local", entryType: "个人报名", teamCode: "", skills: ["RESEARCH"], motivation: "【测试数据】待复审报名。", experience: "", portfolio: "", askMeAbout: "调研", canHelpWith: "资料整理", explore: "环境议题", status: "待复审", teamId: "", createdAt: timestamp(21) }),
    fixture({ id: testId(22), name: "创建队伍同学", studentId: "2026000022", college: "计算机学院", major: "软件工程 · 大二", phone: "1390001022", email: "test-create-team@minicamp.local", entryType: "个人报名", teamCode: "", skills: ["DEV", "PRODUCT"], motivation: "【测试数据】可用于测试创建队伍。", experience: "", portfolio: "", askMeAbout: "MVP", canHelpWith: "前端开发", explore: "发起项目", status: "已录取", teamId: "", createdAt: timestamp(22) }),
    fixture({ id: testId(23), name: "加入队伍同学", studentId: "2026000023", college: "商学院", major: "市场营销 · 大三", phone: "1390001023", email: "test-join-team@minicamp.local", entryType: "个人报名", teamCode: "", skills: ["BUSINESS", "PRODUCT"], motivation: "【测试数据】可用于测试加入和锁定队伍。", experience: "", portfolio: "", askMeAbout: "用户访谈", canHelpWith: "现场展示", explore: "加入队伍", status: "已录取", teamId: "", createdAt: timestamp(23) })
  );

  const teams = teamDefinitions.map((definition, index) => {
    const number = index + 1;
    return fixture({
      id: teamId(number), code: `TEST-${String(number).padStart(2, "0")}`, project: definition[0], theme: definition[2],
      memberIds: [testId(number * 3 - 2), testId(number * 3 - 1), testId(number * 3)],
      status: number === 6 ? "draft" : "locked", locked: number !== 6
    });
  });

  const projects = teamDefinitions.map((definition, index) => {
    const number = index + 1;
    const members = teams[index].memberIds.map((id, memberIndex) => ({
      name: applications.find(item => item.id === id).name,
      role: ["产品 / 开发", "设计 / 展示", "技术 / 数据"][memberIndex]
    }));
    return fixture({
      id: projectId(number), teamId: teamId(number), projectName: definition[3], theme: definition[2],
      tagline: `【测试数据】${definition[1]}`, problem: `【测试数据】${definition[1]}目前缺少简单可用的解决方式。`,
      solution: "【测试数据】提供可运行的网页原型、清晰流程和现场演示。",
      members, demoUrl: `https://example.com/demo/${number}`, githubUrl: `https://github.com/example/minicamp-test-${number}`,
      coverUrl: "", aiTools: ["Cursor", "Codex"], status: number === 6 ? "draft" : "published", createdAt: timestamp(number)
    });
  });

  const ideas = [
    ["TEST-IDEA-01", "图书馆安静角落雷达", "让同学快速找到适合当前任务的学习空间。", "Reimagine Campus", testId(19), ["PRODUCT", "DEV"]],
    ["TEST-IDEA-02", "校园无障碍路线标注", "把真实体验转化为更友好的校园路线。", "Build for Humans", testId(20), ["DESIGN", "RESEARCH"]],
    ["TEST-IDEA-03", "食堂剩余餐食提醒", "减少浪费，也让晚到的人有更多选择。", "Create the Unexpected", testId(21), ["DEV", "BUSINESS"]]
  ].map((item, index) => fixture({ id: item[0], title: item[1], summary: `【测试数据】${item[2]}`, theme: item[3], authorId: item[4], needs: item[5], status: "open", createdAt: timestamp(index + 2) }));

  const notices = [
    fixture({ id: "TEST-NOTICE-01", title: "【测试】活动日程已更新", body: "这是面向全部参与者的测试公告，用于验证通知列表、已读状态和时间显示。", type: "活动公告", target: "ALL", readBy: [testId(1), testId(2)], createdAt: timestamp(2) }),
    fixture({ id: "TEST-NOTICE-02", title: "【测试】项目已通过审核", body: "你的项目已发布至 Gallery，可继续检查展示内容。", type: "项目审核", target: testId(4), readBy: [], createdAt: timestamp(3) }),
    fixture({ id: "TEST-NOTICE-03", title: "【测试】请补充报名资料", body: "这是用于验证个人定向通知的测试消息。", type: "资料复核", target: testId(21), readBy: [], createdAt: timestamp(4) })
  ];

  const formalAwards = ["Best Overall", "Best Product", "Best Design", "Best Technical", "Most Unexpected"];
  const votes = [];
  for (let voterNumber = 1; voterNumber <= 10; voterNumber += 1) {
    const ownProject = Math.ceil(voterNumber / 3);
    const available = [1, 2, 3, 4, 5].filter(number => number !== ownProject);
    const selections = formalAwards.flatMap((award, awardIndex) => {
      const choices = [...available.slice(awardIndex % available.length), ...available.slice(0, awardIndex % available.length)].slice(0, 3);
      return choices.map((projectNumber, rank) => ({ award, projectId: projectId(projectNumber), points: 3 - rank }));
    });
    selections.push({ award: "People's Choice", projectId: projectId(available[3]), points: 1 });
    votes.push(fixture({ id: `TEST-VOTE-${String(voterNumber).padStart(2, "0")}`, voterId: testId(voterNumber), role: "participant", selections, createdAt: timestamp(voterNumber) }));
  }
  votes.push(...formalAwards.map((award, index) => fixture({
    id: `TEST-JURY-VOTE-${String(index + 1).padStart(2, "0")}`, voterId: "TEST-JURY", role: "jury",
    selections: [{ award, projectId: projectId((index % 5) + 1), points: 3 }], createdAt: timestamp(index + 5)
  })));

  state.applications.push(...applications);
  state.teams.push(...teams);
  state.ideas.push(...ideas);
  state.projects.push(...projects);
  state.notices.unshift(...notices);
  state.votes.push(...votes);
  state.config = {
    ...state.config, applicationOpen: true, voteOpen: true, voteStartAt: "2026-09-01T00:00:00+08:00",
    participantWeight: 60, juryWeight: 40
  };
  state.testFixtures = { active: true, configBefore };
  return { applications: applications.length, teams: teams.length, ideas: ideas.length, projects: projects.length, notices: notices.length, votes: votes.length };
}

const store = await openStore();
const state = normalize(store.state);
if (action === "clear") {
  const removed = removeFixtures(state);
  await store.save(state);
  console.log(`已从 ${store.kind} 清除测试数据：${JSON.stringify(removed)}`);
} else {
  removeFixtures(state);
  const created = createFixtures(state);
  await store.save(state);
  console.log(`已写入 ${store.kind} 测试数据：${JSON.stringify(created)}`);
}
