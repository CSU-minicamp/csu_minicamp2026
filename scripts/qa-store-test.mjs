/**
 * 问答存储层单元测试
 *
 * 本机没有 MySQL 时也能跑：注入一个内存版 query 模拟 MySQL 行为，
 * 校验表模式下的 SQL 语句、参数顺序、时间戳格式与字段映射，以及 fallback 行为。
 * 覆盖：问答 CRUD、四种状态、置顶排序、追问（qa_threads 关系表）、会话树、回退模式。
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

const COLUMN_LINE = /^\s*([a-z_]+)\s+(VARCHAR|TEXT|TIMESTAMP|ENUM|TINYINT)/i;

/** 极简内存 MySQL：只认 qa-store 会发出的那几种语句。 */
function createFakeMysql() {
  const calls = [];
  const tables = new Map([["qa_questions", new Map()], ["qa_threads", new Map()]]);
  const table = name => (tables.has(name) ? tables.get(name) : (tables.set(name, new Map()), tables.get(name)));
  return {
    calls,
    dump: name => [...table(name).values()],
    query: async (sql, params = []) => {
      calls.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
      if (/CREATE TABLE IF NOT EXISTS (\w+)/i.test(sql)) return [{}, []];
      if (/information_schema\.COLUMNS/i.test(sql)) {
        return [[...sql.matchAll(new RegExp(COLUMN_LINE, "gm"))].map(match => ({ COLUMN_NAME: match[1] })), []];
      }
      if (/ALTER TABLE qa_questions/i.test(sql)) return [{}, []];
      if (/^SELECT .* FROM qa_threads/i.test(sql)) return [[...table("qa_threads").values()], []];
      if (/^SELECT .* FROM qa_questions/i.test(sql)) return [[...table("qa_questions").values()], []];
      if (/^INSERT INTO qa_questions/i.test(sql)) {
        const [question_id, asker_id, parent_question_id, question, asked_at, answer, answered_at, status, answered_by, updated_at] = params;
        table("qa_questions").set(question_id, { question_id, asker_id, parent_question_id, question, asked_at, answer, answered_at, status, answered_by, updated_at });
        return [{ affectedRows: 1 }, []];
      }
      if (/^INSERT INTO qa_threads/i.test(sql)) {
        const [root_question_id, parent_question_id, depth, last_activity_at, created_at] = params;
        const existing = table("qa_threads").get(root_question_id);
        table("qa_threads").set(root_question_id, {
          root_question_id,
          parent_question_id,
          depth: Math.max(Number(depth), existing?.depth || 0),
          last_activity_at,
          created_at: existing?.created_at || created_at,
          updated_at: last_activity_at
        });
        return [{ affectedRows: 1 }, []];
      }
      if (/^DELETE FROM qa_questions/i.test(sql)) {
        const ids = Array.isArray(params[0]) ? params[0] : [params[0]];
        for (const id of ids) table("qa_questions").delete(id);
        return [{ affectedRows: ids.length }, []];
      }
      if (/^DELETE FROM qa_threads/i.test(sql)) {
        table("qa_threads").delete(params[0]);
        return [{ affectedRows: 1 }, []];
      }
      if (/^UPDATE qa_questions SET/i.test(sql)) {
        if (/SET status = \?/i.test(sql)) {
          const [status, answered_by, updated_at, question_id] = params;
          const row = table("qa_questions").get(question_id);
          if (!row) return [{ affectedRows: 0 }, []];
          Object.assign(row, { status, answered_by, updated_at });
          return [{ affectedRows: 1 }, []];
        }
        const [answer, answered_at, answered_by, status, updated_at, question_id] = params;
        const row = table("qa_questions").get(question_id);
        if (!row) return [{ affectedRows: 0 }, []];
        Object.assign(row, { answer, answered_at, answered_by, updated_at, status });
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

check("初始化建了问答表与会话关系表", fake.calls.some(call => /CREATE TABLE IF NOT EXISTS qa_questions/i.test(call.sql)) && fake.calls.some(call => /CREATE TABLE IF NOT EXISTS qa_threads/i.test(call.sql)), fake.calls.slice(0, 2).map(call => call.sql.slice(0, 48)));
check("初始化校验并补齐辅助列", fake.calls.some(call => /information_schema\.COLUMNS/i.test(call.sql)), "information_schema");
check("初始化补齐 parent 索引", fake.calls.some(call => /ADD KEY idx_qa_parent/i.test(call.sql)), "index ddl");
check("初始化不建自引用外键，并尝试清掉旧的自引用外键", !fake.calls.some(call => /ADD CONSTRAINT fk_qa_parent/i.test(call.sql)) && fake.calls.some(call => /DROP FOREIGN KEY fk_qa_parent/i.test(call.sql)), fake.calls.filter(call => /fk_qa_parent/i.test(call.sql)).map(call => call.sql.slice(0, 60)));

const created = await store.createQuestion({ askerId: "MC26-1001", question: "现场有电源吗？" });
check("表模式提问返回问题ID", /^Q-[0-9A-F]{10}$/.test(created.question?.question_id || ""), created);
const insert = fake.calls.find(call => /^INSERT INTO qa_questions/i.test(call.sql));
check("INSERT 字段与参数一一对应（10 列 10 值）", Boolean(insert) && insert.params.length === 10, insert);
check("INSERT 使用 MySQL 兼容的时间戳格式", /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(insert?.params[4])), insert?.params[4]);
check("INSERT 默认 pending、无答案、parent 为 NULL", insert?.params[2] === null && insert?.params[5] === null && insert?.params[6] === null && insert?.params[7] === "pending", insert?.params);
check("原始问题同时登记会话行（depth 0）", fake.dump("qa_threads").some(row => row.root_question_id === created.question.question_id && Number(row.depth) === 0), fake.dump("qa_threads"));

// --- 追问 ---
// 追问的前提是"父问题已经被回答过"，所以先给根问题一个答案。
const rootAnsweredFirst = await store.answerQuestion({ questionId: created.question.question_id, answer: "有，建议自带插排。", answeredBy: "组委会" });
check("准备：先回答根问题（追问的前提）", rootAnsweredFirst.question?.status === "answered", rootAnsweredFirst);
const follow1 = await store.createFollowUp({ askerId: "MC26-1001", parentQuestionId: created.question.question_id, question: "追问：插排需要自带吗？" });
check("追问创建成功且指向父问题", follow1.question?.parent_question_id === created.question.question_id && follow1.depth === 1, follow1);
check("追问归入同一会话", follow1.rootQuestionId === created.question.question_id, follow1.rootQuestionId);
// 追问要能被继续追问，前提同样是"这条追问已经被回答过"
await store.answerQuestion({ questionId: follow1.question.question_id, answer: "需要，建议自带。", answeredBy: "组委会" });
const follow2 = await store.createFollowUp({ askerId: "MC26-1001", parentQuestionId: follow1.question.question_id, question: "再追问：有 USB 口吗？" });
check("追问可以继续追问（depth 2）", follow2.depth === 2 && follow2.rootQuestionId === created.question.question_id, follow2);
const threadRow = fake.dump("qa_threads").find(row => row.root_question_id === created.question.question_id);
check("qa_threads 记录会话层级与活动时间", Number(threadRow?.depth) === 2 && Boolean(threadRow?.last_activity_at), threadRow);
check("qa_threads 每个会话只有一行（UPSERT）", fake.dump("qa_threads").filter(row => row.root_question_id === created.question.question_id).length === 1, fake.dump("qa_threads").length);

const stranger = await store.createFollowUp({ askerId: "MC26-1002", parentQuestionId: created.question.question_id, question: "别人也想追问" });
check("非原提问者追问被拒(403)", stranger.status === 403 && stranger.error === "only the original asker can follow up", stranger);
const missingParent = await store.createFollowUp({ askerId: "MC26-1001", parentQuestionId: "Q-NOTEXIST", question: "父问题不存在" });
check("父问题不存在返回 404", missingParent.status === 404, missingParent);
const noParent = await store.createFollowUp({ askerId: "MC26-1001", parentQuestionId: "", question: "没有父问题" });
check("缺少父问题返回 400", noParent.status === 400, noParent);
// 追问的前提是父问题已经被回答过
const unansweredRoot = await store.createQuestion({ askerId: "MC26-1002", question: "这条还没被回答的独立问题" });
check("准备：建一条未回答的问题", Boolean(unansweredRoot.question), unansweredRoot);
const onUnanswered = await store.createFollowUp({ askerId: "MC26-1002", parentQuestionId: unansweredRoot.question.question_id, question: "没答案就想追问" });
check("父问题还没回答时追问被拒(409)", onUnanswered.status === 409 && onUnanswered.error === "parent question is not answered yet", onUnanswered);
await store.answerQuestion({ questionId: unansweredRoot.question.question_id, answer: "先给个答案", answeredBy: "组委会" });
const afterAnswered = await store.createFollowUp({ askerId: "MC26-1002", parentQuestionId: unansweredRoot.question.question_id, question: "有答案后可以追问" });
check("父问题回答后可以追问", !afterAnswered.error && afterAnswered.depth === 1, afterAnswered);
const duplicatedFollow = await store.createFollowUp({ askerId: "MC26-1001", parentQuestionId: created.question.question_id, question: "追问：插排需要自带吗？" });
check("同样内容的追问去重(409)", duplicatedFollow.status === 409, duplicatedFollow);

const session = store.listSession(created.question.question_id);
// 同一秒内 created_at/asked_at 精度相同，顺序不保证；这里校验"同会话 + 父子链正确"。
const sessionParentOf = id => session.find(row => row.question_id === id)?.parent_question_id ?? null;
check("会话树返回同一会话的 3 条且父子链正确", session.length === 3
  && sessionParentOf(created.question.question_id) === null
  && sessionParentOf(follow1.question.question_id) === created.question.question_id
  && sessionParentOf(follow2.question.question_id) === follow1.question.question_id,
  session.map(row => [row.question_id, row.parent_question_id]));
check("rootOf 能定位任意追问所属会话与层级", store.rootOf(follow2.question.question_id).rootQuestionId === created.question.question_id && store.rootOf(follow2.question.question_id).depth === 2, store.rootOf(follow2.question.question_id));
check("threadInfo / listThreads 可读会话行", store.threadInfo(created.question.question_id)?.depth === 2 && store.listThreads().length >= 1, store.listThreads().length);

// 追问独立状态：隐藏只影响自己（follow1 的答案已在上面写入）
const followAfter = store.list({ askerId: "MC26-1001" }).find(row => row.question_id === follow1.question.question_id);
check("追问回答后自己变成 answered", followAfter.status === "answered" && followAfter.answer === "需要，建议自带。", followAfter);
const rootRow = store.list().find(row => row.question_id === created.question.question_id);
check("回答追问不影响原问题状态与答案", rootRow.status === "answered" && rootRow.answer === "有，建议自带插排。", rootRow);
await store.setStatus({ questionId: follow2.question.question_id, status: "hidden" });
check("追问可以单独隐藏", store.list().find(row => row.question_id === follow2.question.question_id).status === "hidden", "hidden");
check("公开列表只返回会话根（追问不单独出现）", store.listPublic().length === 2 && store.listPublic().every(row => !row.parent_question_id), store.listPublic().map(row => row.question_id));
check("统计区分根与追问", store.stats().followUps === 3 && store.stats().roots === store.stats().total - 3, store.stats());

// --- 回答 / 置顶 / 隐藏（原有行为） ---
const answered = await store.answerQuestion({ questionId: created.question.question_id, answer: "有，建议自带插排。", answeredBy: "组委会" });
const update = fake.calls.filter(call => /^UPDATE qa_questions SET/i.test(call.sql)).find(call => /answer = \?, answered_at = \?, answered_by = \?, status = \?/i.test(call.sql));
check("UPDATE 语句包含答案、回答时间、回答人、状态与主键", Boolean(update) && update.params.length === 6 && update.params[3] === "answered", update);
check("回答后内存对象同步更新", answered.question?.status === "answered" && answered.question?.answered_by === "组委会" && Boolean(Date.parse(answered.question?.answered_at)), answered.question);
check("表模式不写 JSON 回退文件", await fs.readFile(fallbackPath, "utf8").then(() => false, () => true), fallbackPath);
check("公开列表此时只含会话根", store.listPublic().length === 2 && store.listPublic().every(row => !row.parent_question_id), store.listPublic().map(row => row.question_id));

const pinned = await store.setStatus({ questionId: created.question.question_id, status: "pinned", answeredBy: "组委会" });
check("置顶成功且状态为 pinned", pinned.question?.status === "pinned", pinned);
check("置顶问题仍在公开列表最前", store.listPublic()[0]?.question_id === created.question.question_id, store.listPublic().map(row => [row.question_id, row.status]));
const hidden = await store.setStatus({ questionId: created.question.question_id, status: "hidden" });
check("隐藏后不出现在公开列表", hidden.question?.status === "hidden" && !store.listPublic().some(row => row.question_id === created.question.question_id), store.listPublic().map(row => row.question_id));
const revertFromHidden = await store.setStatus({ questionId: created.question.question_id, status: "pending" });
check("隐藏态不能退回待回答(400)", revertFromHidden.status === 400 && revertFromHidden.error === "answered question cannot go back to pending", revertFromHidden);
await store.setStatus({ questionId: created.question.question_id, status: "answered" });
const revertFromAnswered = await store.setStatus({ questionId: created.question.question_id, status: "pending" });
check("已回答态不能退回待回答(400)", revertFromAnswered.status === 400, revertFromAnswered);
await store.setStatus({ questionId: created.question.question_id, status: "hidden" });

const hiddenPending = await store.createQuestion({ askerId: "MC26-1002", question: "隐藏的待回答问题？" });
await store.createQuestion({ askerId: "MC26-1002", question: "重复提交一次？" });
const stillPending = await store.setStatus({ questionId: hiddenPending.question.question_id, status: "pending" });
check("没有答案的问题仍可保持待回答", stillPending.question?.status === "pending", stillPending);
const publishedWithoutAnswer = await store.setStatus({ questionId: hiddenPending.question.question_id, status: "answered" });
check("没有答案时不允许公开(400)", publishedWithoutAnswer.status === 400 && publishedWithoutAnswer.error === "answer required before publishing", publishedWithoutAnswer);
const invalidStatus = await store.setStatus({ questionId: hiddenPending.question.question_id, status: "top" });
check("非法状态被拒绝(400)", invalidStatus.status === 400 && invalidStatus.error === "invalid status", invalidStatus);
const missingQuestion = await store.setStatus({ questionId: "Q-NOTEXIST", status: "hidden" });
check("对不存在的问题置顶/隐藏返回 404", missingQuestion.status === 404, missingQuestion);
check("stats 覆盖四种状态", ["pending", "answered", "pinned", "hidden"].every(key => Number.isInteger(store.stats()[key])), store.stats());
const pendingDedup = await store.createQuestion({ askerId: "MC26-1002", question: "隐藏的待回答问题？" });
check("待回答问题仍然去重(409)", pendingDedup.status === 409, pendingDedup);
const duplicateAnswered = await store.createQuestion({ askerId: "MC26-1001", question: "  现场有电源吗？  " });
check("已回答的问题允许再次提问（去重只针对待回答）", !duplicateAnswered.error, duplicateAnswered);

// --- 表模式 hydrate：模拟服务重启后从表里读回数据 ---
const restart = createQaStore({ query: fake.query, getPool: () => ({ fake: true }), fallbackPath, warn: message => warnings.push(message) });
const reloaded = await restart.initialize();
check("重启后从表 hydrate（8 条：3 条会话内 + 5 条独立）", reloaded === 8 && restart.mode() === "table", { reloaded, mode: restart.mode() });
const restored = restart.list().find(row => row.question_id === created.question.question_id);
check("hydrate 保留答案、回答人与隐藏状态", restored?.answer === "有，建议自带插排。" && restored?.status === "hidden" && restored?.answered_by === "组委会", restored);
const restoredFollow = restart.list().find(row => row.question_id === follow2.question.question_id);
check("hydrate 保留追问的父指针与独立状态", restoredFollow?.parent_question_id === follow1.question.question_id && restoredFollow?.status === "hidden", restoredFollow);
const restoredThread = restart.threadInfo(created.question.question_id);
check("hydrate 从 qa_threads 读回会话层级", restoredThread?.depth === 2 && restoredThread?.root_question_id === created.question.question_id, restoredThread);
check("hydrate 后会话树仍完整", restart.listSession(created.question.question_id).length === 3, restart.listSession(created.question.question_id).length);
check("hydrate 把 TIMESTAMP 转成可读时间", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(String(restored?.asked_at)), restored?.asked_at);

// --- 删除整条会话（应用层显式删除，不依赖自引用外键级联） ---
const removed = await restart.deleteSession(created.question.question_id);
check("deleteSession 返回被删除的 3 条", removed.deleted?.length === 3, removed);
check("deleteSession 后问答表中不再有会话内记录", restart.listSession(created.question.question_id).length === 0, restart.listSession(created.question.question_id));
check("deleteSession 后 qa_threads 行也清掉", restart.threadInfo(created.question.question_id) === null, restart.threadInfo(created.question.question_id));
check("deleteSession 发出一条批量 DELETE 与一条会话行 DELETE", fake.calls.some(call => /^DELETE FROM qa_questions WHERE question_id IN \(\?\)/i.test(call.sql) && call.params[0].length === 3) && fake.calls.some(call => /^DELETE FROM qa_threads WHERE root_question_id = \?/i.test(call.sql)), "delete sql");
const missingSession = await restart.deleteSession("Q-NOTEXIST");
check("删除不存在的会话返回 404", missingSession.status === 404, missingSession);

// --- 导入路径（putQuestion）也要登记会话行 ---
const importedRoot = await restart.putQuestion({ question_id: "Q-IMPORT-ROOT", asker_id: "MC26-1001", question: "导入的原始问题", status: "answered", answer: "导入答案", asked_at: "2026-09-01T10:00:00+08:00" });
check("导入根问题成功", !importedRoot.error, importedRoot);
check("导入根问题登记了 depth 0 的会话行", Number(restart.threadInfo("Q-IMPORT-ROOT")?.depth) === 0, restart.threadInfo("Q-IMPORT-ROOT"));
const importedFollow = await restart.putQuestion({ question_id: "Q-IMPORT-FOLLOW", asker_id: "MC26-1001", parent_question_id: "Q-IMPORT-ROOT", question: "导入的追问", status: "pending", asked_at: "2026-09-01T11:00:00+08:00" });
check("导入追问成功且父指针正确", importedFollow.question?.parent_question_id === "Q-IMPORT-ROOT", importedFollow);
check("导入追问把会话 depth 提升到 1", Number(restart.threadInfo("Q-IMPORT-ROOT")?.depth) === 1, restart.threadInfo("Q-IMPORT-ROOT"));
check("rootOf 能定位导入的追问", restart.rootOf("Q-IMPORT-FOLLOW").rootQuestionId === "Q-IMPORT-ROOT" && restart.rootOf("Q-IMPORT-FOLLOW").depth === 1, restart.rootOf("Q-IMPORT-FOLLOW"));

// --- 回退模式 ---
const failed = createQaStore({ query: async () => { throw new Error("connect ECONNREFUSED"); }, getPool: () => undefined, fallbackPath, warn: message => warnings.push(message) });
const fallbackRows = await failed.initialize();
check("MySQL 不可用时回退 JSON 模式", failed.mode() === "json" && warnings.some(message => message.includes("JSON 存储")) && fallbackRows === 0, { mode: failed.mode(), warnings: warnings.length });
await failed.createQuestion({ askerId: "TEST-APP-01", question: "离线时能提问吗？" });
const saved = JSON.parse(await fs.readFile(fallbackPath, "utf8"));
check("回退模式写入 data 目录下的问答文件", saved.questions?.length === 1 && saved.questions[0].asker_id === "TEST-APP-01", saved.questions);
const offlineRoot = await failed.createQuestion({ askerId: "TEST-APP-01", question: "离线时能追问吗？" });
await failed.answerQuestion({ questionId: offlineRoot.question.question_id, answer: "离线也有答案", answeredBy: "组委会" });
const offlineFollow = await failed.createFollowUp({ askerId: "TEST-APP-01", parentQuestionId: offlineRoot.question.question_id, question: "离线追问一条" });
check("回退模式也能建追问（内存关系）", offlineFollow.question?.parent_question_id === offlineRoot.question.question_id && failed.listSession(offlineRoot.question.question_id).length === 2, offlineFollow);
check("回退模式的会话行落在内存里", failed.threadInfo(offlineRoot.question.question_id)?.depth === 1, failed.threadInfo(offlineRoot.question.question_id));

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
