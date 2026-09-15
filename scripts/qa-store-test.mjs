/**
 * 问答存储层「MySQL 表模式」单元测试
 *
 * 本机没有 MySQL 时也能跑：注入一个内存版 query 模拟 MySQL 行为，
 * 校验表模式下的 SQL 语句、参数顺序、时间戳格式与字段映射，以及 fallback 行为。
 *
 * 用法：node scripts/qa-store-test.mjs
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createQaStore } from "../storage/qa-store.mjs";

const checks = [];
function check(name, condition, detail) {
  checks.push({ name, ok: Boolean(condition) });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${condition ? "" : "  → " + JSON.stringify(detail)}`);
}

const COLUMN_LINE = /^\s*([a-z_]+)\s+(VARCHAR|TEXT|TIMESTAMP|ENUM)/i;

/** 极简内存 MySQL：只认 qa-store 会发出的那几种语句。 */
function createFakeMysql() {
  const calls = [];
  let table = null;
  return {
    calls,
    dump: () => (table ? [...table.values()] : []),
    query: async (sql, params = []) => {
      calls.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
      if (/CREATE TABLE IF NOT EXISTS qa_questions/i.test(sql)) {
        if (!table) table = new Map();
        return [{}, []];
      }
      if (/information_schema\.COLUMNS/i.test(sql)) {
        const names = [...sql.matchAll(new RegExp(COLUMN_LINE, "gm"))].map(match => ({ COLUMN_NAME: match[1] }));
        return [names, []];
      }
      if (/ALTER TABLE qa_questions ADD COLUMN/i.test(sql)) return [{}, []];
      if (/^SELECT .* FROM qa_questions/i.test(sql)) {
        if (!table) throw new Error("ER_NO_SUCH_TABLE");
        return [[...table.values()], []];
      }
      if (/^INSERT INTO qa_questions/i.test(sql)) {
        const [question_id, asker_id, question, asked_at, answer, answered_at, status, answered_by, updated_at] = params;
        const row = { question_id, asker_id, question, asked_at, answer, answered_at, status, answered_by, updated_at };
        table.set(question_id, row);
        return [{ affectedRows: 1 }, []];
      }
      if (/^UPDATE qa_questions SET/i.test(sql)) {
        const [answer, answered_at, answered_by, updated_at, question_id] = params;
        const row = table.get(question_id);
        if (!row) return [{ affectedRows: 0 }, []];
        Object.assign(row, { answer, answered_at, answered_by, updated_at, status: "answered" });
        return [{ affectedRows: 1 }, []];
      }
      throw new Error("unexpected SQL: " + sql);
    }
  };
}

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "qa-store-"));
const fallbackPath = path.join(tempDir, "qa.json");
const warnings = [];

// --- 表模式 ---
const fake = createFakeMysql();
const store = createQaStore({ query: fake.query, getPool: () => ({ fake: true }), fallbackPath, warn: message => warnings.push(message) });
const hydrated = await store.initialize();
check("初始化走表模式，无回退告警", store.mode() === "table" && warnings.length === 0 && hydrated === 0, { mode: store.mode(), warnings });

check("初始化执行了建表语句", fake.calls.some(call => /CREATE TABLE IF NOT EXISTS qa_questions/i.test(call.sql)), fake.calls[0]?.sql);
check("初始化校验并补齐辅助列", fake.calls.some(call => /information_schema\.COLUMNS/i.test(call.sql)), fake.calls.map(call => call.sql.slice(0, 40)));

const created = await store.createQuestion({ askerId: "MC26-1001", question: "现场有电源吗？" });
check("表模式提问返回问题ID", /^Q-[0-9A-F]{10}$/.test(created.question?.question_id || ""), created);
const insert = fake.calls.find(call => /^INSERT INTO qa_questions/i.test(call.sql));
check("INSERT 字段与参数一一对应（9 列 9 值）", Boolean(insert) && insert.params.length === 9, insert);
check("INSERT 使用 MySQL 兼容的时间戳格式", /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(insert?.params[3])), insert?.params[3]);
check("INSERT 默认 pending、无答案、无回答时间", insert?.params[4] === null && insert?.params[5] === null && insert?.params[6] === "pending", insert?.params);
check("asker_id 原样写入", insert?.params[1] === "MC26-1001", insert?.params[1]);

const answered = await store.answerQuestion({ questionId: created.question.question_id, answer: "有，建议自带插排。", answeredBy: "组委会" });
const update = fake.calls.find(call => /^UPDATE qa_questions SET/i.test(call.sql));
check("UPDATE 语句包含答案、回答时间、回答人、状态与主键", Boolean(update) && /status = 'answered'/i.test(update.sql) && update.params.length === 5, update);
check("回答后内存对象同步更新", answered.question?.status === "answered" && answered.question?.answered_by === "组委会" && Boolean(Date.parse(answered.question?.answered_at)), answered.question);
check("表模式不写 JSON 回退文件", await fs.readFile(fallbackPath, "utf8").then(() => false, () => true), fallbackPath);
check("统计与筛选可用", store.stats().answered === 1 && store.listAnswered().length === 1 && store.list({ askerId: "MC26-1001" }).length === 1, store.stats());

const duplicate = await store.createQuestion({ askerId: "MC26-1001", question: "  现场有电源吗？  " });
check("已回答的问题允许再次提问（去重只针对待回答）", !duplicate.error, duplicate);

// --- 表模式 hydrate：模拟服务重启后从表里读回数据 ---
const restart = createQaStore({ query: fake.query, getPool: () => ({ fake: true }), fallbackPath, warn: message => warnings.push(message) });
const reloaded = await restart.initialize();
check("重启后从表 hydrate 到 2 条记录", reloaded === 2 && restart.mode() === "table", { reloaded, mode: restart.mode() });
const restored = restart.list().find(row => row.question_id === created.question.question_id);
check("hydrate 保留答案、回答人与状态", restored?.answer === "有，建议自带插排。" && restored?.status === "answered" && restored?.answered_by === "组委会", restored);
check("hydrate 把 TIMESTAMP 转成可读时间", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(String(restored?.asked_at)), restored?.asked_at);

// --- 回退模式 ---
const failed = createQaStore({ query: async () => { throw new Error("connect ECONNREFUSED"); }, getPool: () => undefined, fallbackPath, warn: message => warnings.push(message) });
const fallbackRows = await failed.initialize();
check("MySQL 不可用时回退 JSON 模式", failed.mode() === "json" && warnings.some(message => message.includes("JSON 存储")) && fallbackRows === 0, { mode: failed.mode(), warnings: warnings.length });
await failed.createQuestion({ askerId: "TEST-APP-01", question: "离线时能提问吗？" });
const saved = JSON.parse(await fs.readFile(fallbackPath, "utf8"));
check("回退模式写入 data 目录下的问答文件", saved.questions?.length === 1 && saved.questions[0].asker_id === "TEST-APP-01", saved.questions);

const tooLong = await failed.createQuestion({ askerId: "TEST-APP-01", question: "x".repeat(2001) });
check("超长问题被拒绝(400)", tooLong.status === 400 && tooLong.error === "question too long", tooLong);
const noAsker = await failed.createQuestion({ askerId: "  ", question: "匿名" });
check("缺少提问人 id 被拒绝(401)", noAsker.status === 401, noAsker);
const badId = await failed.answerQuestion({ questionId: "存在 空格", answer: "答" });
check("非法问题ID被拒绝(400)", badId.status === 400, badId);

await store.flush();
await failed.flush();
await fs.rm(tempDir, { recursive: true, force: true });

const failures = checks.filter(item => !item.ok);
console.log(`\n${checks.length - failures.length}/${checks.length} 通过`);
process.exit(failures.length ? 1 : 0);
