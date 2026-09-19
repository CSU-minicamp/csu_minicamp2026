#!/usr/bin/env node
/**
 * 隐私回归测试：匿名请求公开接口，确认不会下发他人的报名资料，也拿不到队伍邀请码。
 *
 * 跑法：
 *   npm run privacy-test                    # 自己起一个临时实例（JSON 存储，不碰 MySQL）
 *   BASE_URL=http://127.0.0.1:4173 npm run privacy-test   # 测已经在跑的实例
 *
 * 设计约定：
 *   - 全程只发 GET，不写任何数据；临时实例强制走 JSON 存储（MYSQL_PORT=1），不会污染线上库。
 *   - 只断言「公开接口不该出现的字段」：手机号 / 邮箱 / 学号 / 动机 / 经历 / 作品集等；
 *     队伍成员只允许白名单字段。以后新增字段如果没做裁剪，这里会直接失败。
 *   - 需要登录的接口应返回 401；静态目录不能穿越出去。
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// 公开接口绝不能出现的字段（他人报名资料）
const FORBIDDEN_KEYS = ["phone", "email", "studentId", "motivation", "experience", "portfolio", "canHelpWith", "explore", "askMeAbout"];
// 队伍成员允许下发的字段（白名单，与 server.mjs 的 memberView() 对应）
const MEMBER_KEYS = ["id", "name", "college", "major", "grade", "skills", "status", "registration_type", "registrationType"];
const PUBLIC_ENDPOINTS = ["/api/teams", "/api/projects", "/api/ideas", "/api/qa/public", "/api/config", "/api/starter-pack"];
const NO_CODE_ENDPOINTS = ["/api/teams", "/api/projects"];   // 这两处不该出现队伍邀请码 code
const PROTECTED_ENDPOINTS = ["/api/me", "/api/me/notices", "/api/me/vote", "/api/admin/summary", "/api/organizer/summary"];
const TRAVERSAL_PATHS = ["/../.env", "/..%2f.env", "/%2e%2e/.env", "/data/minicamp.json", "/qa.json", "/package.json", "/storage/qa-store.mjs"];

let failures = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra && !ok ? "  -> " + extra : ""}`);
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** 收集 JSON 里出现过的键路径（用于定位泄露字段）。 */
function collectKeys(node, prefix = "", found = []) {
  if (Array.isArray(node)) { node.forEach(item => collectKeys(item, prefix + "[]", found)); return found; }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      const here = prefix ? prefix + "." + key : key;
      found.push(here);
      collectKeys(value, here, found);
    }
  }
  return found;
}
async function get(base, path) {
  const response = await fetch(base + path, {headers: {Accept: "application/json"}});
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  return {status: response.status, data};
}
/** 挑出 teams[] / projects[].team 里的成员数组，逐个核对字段白名单。 */
function memberArrays(data) {
  const arrays = [];
  (data.teams || []).forEach(team => arrays.push(team.members || []));
  (data.projects || []).forEach(project => { if (project.team) arrays.push(project.team.members || []); });
  return arrays;
}

async function startServer() {
  const port = Number(process.env.PRIVACY_TEST_PORT || 4100 + Math.floor(Math.random() * 800));
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: {...process.env, MINICAMP_PORT: String(port), MYSQL_PORT: "1"},   // 强制 JSON 存储，不碰 MySQL
    stdio: "ignore"
  });
  const base = "http://127.0.0.1:" + port;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(250);
    try { if ((await get(base, "/api/config")).status === 200) return {base, child}; } catch { /* 还没起来 */ }
  }
  child.kill();
  throw new Error("临时实例 10 秒内没有起来（端口 " + port + " 可能被占用）");
}

const base = process.env.BASE_URL || null;
const server = base ? null : await startServer();
const target = base || server.base;
console.log(`隐私回归测试 → ${target}${base ? "（外部实例）" : "（临时实例，JSON 存储）"}\n`);
try {
  console.log("== 公开接口不能出现他人报名资料 ==");
  let inspected = {projects: 0, teams: 0, members: 0};
  for (const path of PUBLIC_ENDPOINTS) {
    const {status, data} = await get(target, path);
    const keys = collectKeys(data);
    const leaked = FORBIDDEN_KEYS.filter(key => keys.some(found => found === key || found.endsWith("." + key)));
    check(`${path} 不泄露报名资料字段`, status === 200 && leaked.length === 0, `HTTP ${status}${leaked.length ? " / 泄露字段: " + leaked.join(",") : ""}`);
    if (path === "/api/projects") inspected.projects = (data.projects || []).length;
    if (path === "/api/teams") inspected.teams = (data.teams || []).length;
    for (const members of memberArrays(data)) inspected.members += members.length;
  }

  console.log("\n== 队伍成员只允许白名单字段 ==");
  for (const path of ["/api/teams", "/api/projects"]) {
    const {data} = await get(target, path);
    const members = memberArrays(data).flat();
    const extra = [...new Set(members.flatMap(member => Object.keys(member)).filter(key => !MEMBER_KEYS.includes(key)))];
    check(`${path} 的成员字段都在白名单内`, extra.length === 0, "多出字段: " + extra.join(","));
  }

  console.log("\n== 公开列表不下发队伍邀请码 ==");
  for (const path of NO_CODE_ENDPOINTS) {
    const {data} = await get(target, path);
    const hasCode = collectKeys(data).some(found => found === "code" || found.endsWith(".code"));
    check(`${path} 不含队伍邀请码 code`, !hasCode);
  }

  console.log("\n== 需要登录 / 管理员的接口必须 401 ==");
  for (const path of PROTECTED_ENDPOINTS) {
    const {status} = await get(target, path);
    check(`${path} 匿名被拒`, status === 401, "HTTP " + status);
  }

  console.log("\n== 静态目录不能穿越 ==");
  for (const path of TRAVERSAL_PATHS) {
    const response = await fetch(target + path);
    const text = await response.text();
    const leaked = /MINICAMP_ADMIN_PASSWORD|MYSQL_PASSWORD|"applications"|"notices"/.test(text);
    check(`${path} 不可读`, [403, 404].includes(response.status) && !leaked, "HTTP " + response.status);
  }

  console.log(`\n检查范围：${PUBLIC_ENDPOINTS.length} 个公开接口、${inspected.projects} 个已发布项目、${inspected.teams} 支公开招募队伍（共 ${inspected.members} 条成员记录）`);
  if (!inspected.members) console.log("提示：当前没有公开队伍/项目成员可查，成员白名单那条断言是空跑；有数据后会自动生效。");
} finally {
  server?.child.kill();
}

console.log(`\n${failures === 0 ? "全部通过" : failures + " 项失败"}`);
process.exit(failures === 0 ? 0 : 1);
