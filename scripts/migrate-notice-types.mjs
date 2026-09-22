/**
 * 一次性迁移：老通知类型 → 新通知类型（本次消息系统改造的类型合并）。
 *
 *   报名提交 / 路演报名 / 报名进度(application) / roadshow  →  「用户报名（自动）」
 *   资料复核                                                →  「资料修改（自动）」
 *   后台改状态(application + 标题 Application status updated) →  「状态修改（自动）」
 *   问答 / qa / 问答回复                                     →  不变
 *   录取结果 等人工类型                                      →  不变
 *
 * 同时把每条通知的稳定事件键 key 一起改名，避免迁移后新数据与老数据的去重键不一致。
 * 位置：通知对象自己的 key（正常已经是 `类型:收件人:...`，历史数据里可能只有 `类型:...`）。
 * 不动正文：老消息的标题/正文原样保留。
 *
 * 用法（在项目根目录执行，默认是预演，不写库）：
 *     node --env-file-if-exists=.env scripts/migrate-notice-types.mjs            # 预演，只打印会改什么
 *     node --env-file-if-exists=.env scripts/migrate-notice-types.mjs --yes      # 真正写库
 *     node --env-file-if-exists=.env scripts/migrate-notice-types.mjs --yes --json   # 直接改本地 data/minicamp.json
 *
 * 目标库默认取 .env 里的 MYSQL_*（本机就是 user/123456 @ 127.0.0.1:3306/minicamp2026），
 * 也可以用环境变量覆盖：MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dbPath = path.join(root, "data", "minicamp.json");
const argv = process.argv.slice(2);
const apply = argv.includes("--yes");
const useJson = argv.includes("--json");
const mysqlConfig = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "minicamp2026",
  charset: "utf8mb4"
};

/** 老类型 → 新类型。没列到的（问答/录取结果/活动公告…）原样保留。 */
const TYPE_MAP = {
  "报名进度": "报名提交",
  application: "报名提交",
  roadshow: "报名提交",
  "用户报名": "报名提交",
  "资料复核": "资料修改",
  "资料修改": "资料修改"
};
const KEY_PREFIX = { "报名提交": "用户报名", "资料修改": "资料修改", "状态修改": "状态修改" };

/** 判断一条通知是不是「后台改状态」：老数据用 type=application + 英文标题识别。 */
function isLegacyStatusChange(notice) {
  const type = String(notice?.type || "");
  if (type === "状态修改") return false;
  if (type !== "application") return false;
  return /Application status updated/i.test(String(notice?.title || ""));
}

/** 需要改的通知 → 新字段。返回 null 表示这条不用动。 */
function migrateNotice(notice) {
  const type = String(notice?.type || "");
  let nextType = null;
  if (isLegacyStatusChange(notice)) nextType = "状态修改";
  else if (Object.hasOwn(TYPE_MAP, type)) nextType = TYPE_MAP[type];
  if (!nextType || nextType === type) {
    // 类型没变，但 key 前缀可能还是老名字（例如已经是「资料修改」但 key 还是「资料复核:…」）
    const nextKey = rewriteKey(notice, nextType || type);
    return nextKey === notice.key ? null : { ...notice, key: nextKey };
  }
  return { ...notice, type: nextType, key: rewriteKey(notice, nextType) };
}
function rewriteKey(notice, nextType) {
  const raw = String(notice?.key || "");
  const want = KEY_PREFIX[nextType];
  if (!raw || !want) return notice?.key;
  const head = raw.split(":")[0];
  if (!Object.values(KEY_PREFIX).includes(head) && !Object.keys(TYPE_MAP).includes(head) && head !== "application" && head !== "roadshow") return raw;
  return want + raw.slice(head.length);
}
/** 把 状态修改 的老事件键补成新格式（老数据没有 key 时生成一个稳定的） */
function withKey(notice) {
  if (notice?.key) return notice.key;
  if (String(notice.type) === "状态修改") return notice.key;      // 老的状态变更没有稳定 key，保持原样
  if (String(notice.type) === "报名提交") return `用户报名:${notice.target}`;
  if (String(notice.type) === "资料修改") return `资料修改:${notice.target}`;
  return notice.key;
}

function migrateState(state) {
  const notices = Array.isArray(state?.notices) ? state.notices : [];
  let changed = 0;
  const counts = {};
  const migrated = notices.map(notice => {
    const next = migrateNotice(notice);
    if (!next) {
      counts[`${notice.type}（不变）`] = (counts[`${notice.type}（不变）`] || 0) + 1;
      return notice;
    }
    changed += 1;
    counts[`${notice.type} → ${next.type}`] = (counts[`${notice.type} → ${next.type}`] || 0) + 1;
    return { ...next, key: withKey(next) };
  });
  // 去重检查：新键在同一个 target 上应当唯一（用户报名 / 资料修改 都是一人一条）
  const dupes = {};
  for (const notice of migrated) {
    const key = String(notice.key || "");
    if (!key) continue;
    dupes[key] = (dupes[key] || 0) + 1;
  }
  const merged = Object.entries(dupes).filter(([, n]) => n > 1);
  return { notices: migrated, changed, counts, merged, total: notices.length };
}

function report(result, label) {
  console.log(`\n[${label}] 通知 ${result.total} 条，本次迁移 ${result.changed} 条`);
  for (const [k, v] of Object.entries(result.counts).sort((a, b) => b[1] - a[1])) console.log("  " + k + "：" + v);
  if (result.merged.length) {
    console.log("  合并后 key 重复的组合（同一人会看到多条同类消息）：");
    for (const [key, n] of result.merged.slice(0, 10)) console.log("    " + key + " × " + n);
  } else {
    console.log("  合并后没有重复 key ✔");
  }
}

async function runJson() {
  const state = JSON.parse(await fs.readFile(dbPath, "utf8"));
  const result = migrateState(state);
  report(result, apply ? "写回 data/minicamp.json" : "预演 data/minicamp.json");
  if (!apply) { console.log("\n预演结束，没有写文件。确认无误后加 --yes 真正执行。"); return; }
  const backup = dbPath + ".bak-" + new Date().toISOString().replace(/[:.]/g, "-");
  await fs.copyFile(dbPath, backup);
  state.notices = result.notices;
  await fs.writeFile(dbPath, JSON.stringify(state, null, 2), "utf8");
  console.log("已写回 " + dbPath + "\n备份：" + backup);
}

async function runMysql() {
  const conn = await mysql.createConnection(mysqlConfig);
  try {
    const [rows] = await conn.query("SELECT state_json FROM app_state WHERE state_key = 'main'");
    if (!rows.length) { console.log("app_state 里没有 state_key='main'，无需迁移（服务还没写过库）。"); return; }
    const row = rows[0];
    const state = typeof row.state_json === "string" ? JSON.parse(row.state_json) : row.state_json;
    const result = migrateState(state);
    report(result, apply ? "写入 MySQL " + mysqlConfig.database : "预演 MySQL " + mysqlConfig.database);
    if (!apply) { console.log("\n预演结束，没有写库。确认无误后加 --yes 真正执行。"); return; }
    // 写库前先把迁移前的整行存一份到本地文件，方便回滚（生产库仍建议先 mysqldump）。
    const backupDir = path.join(root, "data", "backups");
    await fs.mkdir(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, "app_state-before-notice-types-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json");
    await fs.writeFile(backupFile, JSON.stringify(JSON.parse(typeof row.state_json === "string" ? row.state_json : JSON.stringify(row.state_json))), "utf8");
    state.notices = result.notices;
    await conn.query("UPDATE app_state SET state_json = ? WHERE state_key = 'main'", [JSON.stringify(state)]);
    const [check] = await conn.query("SELECT JSON_LENGTH(state_json, '$.notices') n FROM app_state WHERE state_key = 'main'");
    const [verify] = await conn.query("SELECT state_json FROM app_state WHERE state_key = 'main'");
    const after = typeof verify[0].state_json === "string" ? JSON.parse(verify[0].state_json) : verify[0].state_json;
    const remaining = (after.notices || []).filter(n => ["application", "roadshow", "报名进度", "资料复核"].includes(String(n.type))).length;
    console.log("已写库：notices " + check[0].n + " 条，剩余老类型 " + remaining + " 条（应为 0）");
    console.log("迁移前的整行已另存：" + backupFile);
    console.log("回滚：把该文件的 notices 放回 app_state.state_json，或从 mysqldump 恢复。");
  } finally {
    await conn.end();
  }
}

console.log("目标：" + (useJson ? dbPath : `MySQL ${mysqlConfig.user}@${mysqlConfig.host}:${mysqlConfig.port}/${mysqlConfig.database}`));
console.log(apply ? "模式：执行（会写）" : "模式：预演（只读，不写）");
if (useJson) await runJson();
else await runMysql();
