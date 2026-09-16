/**
 * 把离线期间的问答记录导入 MySQL 表
 *
 * 场景：离线开发时服务回退到 data/qa.json 存了问答，后来 MySQL 接上了。
 * 本脚本把这些记录写进 qa_questions 表；已有的问题默认跳过，加 --force 可覆盖。
 *
 * 用法：
 *   npm run qa-import                 # 读 data/qa.json
 *   node scripts/qa-import.mjs --file=data/qa.json --force
 *
 * 连接参数与 server.mjs 一致：MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE。
 * 导入前请先停掉本地服务（避免同时写），脚本结束会打印表内统计。
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { createQaStore } from "../storage/qa-store.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = name => {
  const found = process.argv.find(item => item.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : "";
};
const force = process.argv.includes("--force");
const sourcePath = path.resolve(root, arg("file") || path.join("data", "qa.json"));

let records;
try {
  const parsed = JSON.parse(await fs.readFile(sourcePath, "utf8"));
  records = (Array.isArray(parsed) ? parsed : parsed?.questions || []).filter(item => item?.question_id && item?.asker_id && item?.question);
} catch (error) {
  console.error(`读不到 ${sourcePath}：${error.message}`);
  process.exit(1);
}
if (!records.length) {
  console.log(`${sourcePath} 里没有可导入的问答记录，无需导入。`);
  process.exit(0);
}

const config = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "minicamp2026",
  connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
  charset: "utf8mb4"
};

let pool;
try {
  pool = mysql.createPool(config);
  const store = createQaStore({ query: (sql, params) => pool.query(sql, params), getPool: () => pool, fallbackPath: sourcePath });
  await store.initialize();
  if (store.mode() !== "table") throw new Error("未能连上 MySQL，已拒绝导入以免写错地方");

  const existing = new Set((await store.list()).map(row => row.question_id));
  let imported = 0;
  let skipped = 0;
  for (const record of records) {
    if (existing.has(record.question_id) && !force) {
      skipped += 1;
      continue;
    }
    const written = await store.putQuestion({ ...record, replace: existing.has(record.question_id) });
    if (written.error) {
      console.error(`  跳过 ${record.question_id}：${written.error}`);
      skipped += 1;
      continue;
    }
    if (record.answer && String(record.answer).trim()) {
      const answered = await store.answerQuestion({ questionId: record.question_id, answer: record.answer, answeredBy: record.answered_by });
      if (answered.error) console.error(`  ${record.question_id} 答案写入失败：${answered.error}`);
    }
    imported += 1;
  }

  const stats = store.stats();
  console.log(`来源：${sourcePath}`);
  console.log(`数据库：${config.user}@${config.host}:${config.port}/${config.database}`);
  console.log(`导入 ${imported} 条，跳过 ${skipped} 条；表内共 ${stats.total} 条（待回答 ${stats.pending}，已回答 ${stats.answered}）。`);
  if (skipped && !force) console.log("如需覆盖同名问题，加 --force 重跑。");
} catch (error) {
  console.error("导入失败：" + (error?.message || error));
  process.exitCode = 1;
} finally {
  await pool?.end().catch(() => {});
}
