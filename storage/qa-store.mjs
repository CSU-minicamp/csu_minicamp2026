/**
 * 问答信息存储层
 *
 * 职责：只负责“问答信息”的读写，不涉及 HTTP 细节。
 *
 * 双存储：
 *   1. MySQL 可用时，读写 qa_questions 表（真正的表存储，与 app_state 的 JSON blob 相互独立）；
 *   2. MySQL 不可用时（离线开发），回退到 data/qa.json，接口行为保持一致。
 *
 * 表结构见 schema.sql / storage/qa-upgrade.sql：
 *   question_id(PK) / asker_id / question / asked_at / answer / answered_at
 *   + status / answered_by / updated_at（后台筛选与审计用）
 *
 * status 四种取值：
 *   pending  待回答：仅提问者本人和主办方可见，不出现在公开列表
 *   answered 已回答：公开展示给所有人
 *   pinned   置顶：已回答且公开，在公开列表最前面
 *   hidden   隐藏：不公开展示（仅提问者本人和主办方可见）
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const QUESTION_ID_RE = /^[A-Za-z0-9-]{1,32}$/;
/** status 的全部取值，顺序即业务优先级：置顶 > 已回答 > 待回答 > 隐藏。 */
export const QA_STATUSES = Object.freeze(["pinned", "answered", "pending", "hidden"]);
/** 公开展示给所有人的状态。 */
export const QA_PUBLIC_STATUSES = Object.freeze(["pinned", "answered"]);

const COLUMNS = "question_id, asker_id, question, asked_at, answer, answered_at, status, answered_by, updated_at";
const HYDRATE_SQL = `SELECT ${COLUMNS} FROM qa_questions ORDER BY asked_at DESC, question_id DESC`;
/** 表已存在但缺列时补齐（例如手工建表只写了 6 个字段），避免升级时启动失败。 */
const EXTRA_COLUMN_DDL = {
  status: "ALTER TABLE qa_questions ADD COLUMN status ENUM('pending','answered','pinned','hidden') NOT NULL DEFAULT 'pending'",
  answered_by: "ALTER TABLE qa_questions ADD COLUMN answered_by VARCHAR(64) NOT NULL DEFAULT ''",
  updated_at: "ALTER TABLE qa_questions ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
};
/** 旧库的 status 可能只有 pending/answered 两种取值，缺值就升级枚举。 */
const STATUS_ENUM_DDL = "ALTER TABLE qa_questions MODIFY COLUMN status ENUM('pending','answered','pinned','hidden') NOT NULL DEFAULT 'pending'";

function toText(value) {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

function toNullableText(value) {
  if (value === null || value === undefined) return null;
  const text = toText(value).trim();
  return text ? text : null;
}

/** MySQL DATETIME / TIMESTAMP / JS Date 统一转成 ISO 字符串，避免时区二次偏移。 */
function toIsoText(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(text)) return text.replace(" ", "T") + "+08:00";
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? text : new Date(parsed).toISOString();
}

/** TIMESTAMP 列不接受 ISO 字符串，写库前转成 MySQL 认识的字面量。 */
function toSqlTimestamp(value) {
  const iso = toIsoText(value);
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 19).replace("T", " ");
}

/** 未知状态一律按 pending 处理，避免脏数据把问题意外公开。 */
function normalizeStatus(value) {
  const status = toText(value).trim().toLowerCase();
  return QA_STATUSES.includes(status) ? status : "pending";
}

function normalizeStored(row) {
  return {
    question_id: toText(row?.question_id),
    asker_id: toText(row?.asker_id),
    question: toText(row?.question),
    asked_at: toIsoText(row?.asked_at),
    answer: toNullableText(row?.answer),
    answered_at: toIsoText(row?.answered_at),
    status: normalizeStatus(row?.status),
    answered_by: toText(row?.answered_by),
    updated_at: toIsoText(row?.updated_at)
  };
}

function sortedDescending(rows) {
  return [...rows].sort((a, b) => {
    const diff = String(b.asked_at || "").localeCompare(String(a.asked_at || ""));
    return diff !== 0 ? diff : String(b.question_id).localeCompare(String(a.question_id));
  });
}

/** 公开列表顺序：置顶在前，其余按提问时间倒序。 */
function publicOrder(rows) {
  return [...rows].sort((a, b) => {
    const pin = (a.status === "pinned" ? 0 : 1) - (b.status === "pinned" ? 0 : 1);
    if (pin !== 0) return pin;
    return String(b.asked_at || "").localeCompare(String(a.asked_at || ""));
  });
}

/**
 * @param {object} options
 * @param {(sql: string, params?: any[]) => Promise<any>} options.query  查询（MySQL 连接池）
 * @param {() => any} options.getPool  返回当前连接池；undefined 表示走 JSON 回退
 * @param {string} options.fallbackPath  JSON 回退文件路径
 * @param {string} [options.answeredBy]  默认回答人标识
 * @param {(message: string) => void} [options.warn] 回退告警
 */
export function createQaStore({ query, getPool, fallbackPath, answeredBy = "ADMIN", warn = console.warn }) {
  let rows = [];
  let useTable = false;
  let queue = Promise.resolve();

  async function readFallback() {
    try {
      const parsed = JSON.parse(await fs.readFile(fallbackPath, "utf8"));
      return (Array.isArray(parsed) ? parsed : parsed?.questions || []).map(normalizeStored);
    } catch {
      return [];
    }
  }

  async function initialize() {
    try {
      if (!getPool()) throw new Error("MySQL unavailable");
      await query(`CREATE TABLE IF NOT EXISTS qa_questions (
        question_id VARCHAR(32) NOT NULL PRIMARY KEY,
        asker_id VARCHAR(64) NOT NULL,
        question TEXT NOT NULL,
        asked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        answer TEXT NULL,
        answered_at TIMESTAMP NULL DEFAULT NULL,
        status ENUM('pending','answered','pinned','hidden') NOT NULL DEFAULT 'pending',
        answered_by VARCHAR(64) NOT NULL DEFAULT '',
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_qa_asker (asker_id),
        KEY idx_qa_status (status, asked_at),
        KEY idx_qa_asked_at (asked_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      const [existing] = await query("SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'qa_questions'");
      const present = new Map(existing.map(column => [column.COLUMN_NAME || column.column_name, column.COLUMN_TYPE || column.column_type || ""]));
      for (const [column, ddl] of Object.entries(EXTRA_COLUMN_DDL)) {
        if (!present.has(column)) await query(ddl);
      }
      // 旧库的 status 只有 pending/answered，缺 pinned/hidden 时升级枚举。
      if (present.has("status") && !["pinned", "hidden"].every(value => String(present.get("status")).includes(value))) await query(STATUS_ENUM_DDL);
      rows = (await query(HYDRATE_SQL))[0].map(normalizeStored);
      useTable = true;
    } catch (error) {
      useTable = false;
      rows = await readFallback();
      warn("问答信息使用 JSON 存储 " + fallbackPath + "：" + (error?.message || error));
    }
    return rows.length;
  }

  /** JSON 回退模式下把内存快照写入本地文件；表模式下无需调用。 */
  function persist() {
    if (useTable) return queue;
    queue = queue.catch(() => {}).then(async () => {
      const snapshot = sortedDescending(rows);
      await fs.mkdir(path.dirname(fallbackPath), { recursive: true });
      await fs.writeFile(fallbackPath, JSON.stringify({ questions: snapshot }, null, 2), "utf8");
    });
    return queue;
  }

  /** 存储模式：table=MySQL 表；json=本地回退文件。 */
  function mode() {
    return useTable ? "table" : "json";
  }

  /**
   * 问答列表，新的在前。
   * @param {object} [options]
   * @param {string} [options.askerId] 只看某人的提问
   * @param {string|string[]} [options.status] 只看某些状态
   * @param {boolean} [options.publicOrder] true 时置顶排最前（公开列表用）
   */
  function list({ askerId, status, publicOrder: byPin } = {}) {
    const wanted = status === undefined || status === null ? null : (Array.isArray(status) ? status : [status]);
    const filtered = rows.filter(row => {
      if (askerId && row.asker_id !== String(askerId)) return false;
      if (wanted && !wanted.includes(row.status)) return false;
      return true;
    });
    return byPin ? publicOrder(filtered) : sortedDescending(filtered);
  }

  /** 公开 FAQ：置顶在最前，然后是已回答；待回答与隐藏的问题一律不出现。 */
  function listPublic() {
    return list({ status: [...QA_PUBLIC_STATUSES], publicOrder: true });
  }

  function stats() {
    const count = status => rows.filter(row => row.status === status).length;
    return {
      total: rows.length,
      pending: count("pending"),
      answered: count("answered"),
      pinned: count("pinned"),
      hidden: count("hidden")
    };
  }

  /** 内存行 → INSERT 参数，保证列顺序与 COLUMNS 一致。 */
  function insertParams(row) {
    return [row.question_id, row.asker_id, row.question, toSqlTimestamp(row.asked_at), row.answer, toSqlTimestamp(row.answered_at), row.status, row.answered_by, toSqlTimestamp(row.updated_at)];
  }

  /** 按指定 id 写入一条记录；id 已存在且 replace=true 时覆盖。供导入等场景使用。 */
  async function putQuestion(record) {
    const row = normalizeStored(record);
    if (!row.question_id) return { error: "question id required", status: 400 };
    if (!row.asker_id) return { error: "asker id required", status: 400 };
    if (!row.question) return { error: "question required", status: 400 };
    const now = new Date().toISOString();
    row.asked_at = row.asked_at || now;
    if (["answered", "pinned"].includes(row.status) && !row.answered_at) row.answered_at = now;
    row.updated_at = row.updated_at || row.answered_at || row.asked_at;
    if (!useTable) {
      rows = rows.filter(item => item.question_id !== row.question_id);
      rows.push(row);
      await persist();
      return { question: row };
    }
    try {
      if (record.replace) await query("DELETE FROM qa_questions WHERE question_id = ?", [row.question_id]);
      await query(`INSERT INTO qa_questions (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, insertParams(row));
    } catch (error) {
      if (error?.code === "ER_DUP_ENTRY") return { error: "question id already exists", status: 409 };
      return { error: error?.message || "storage error", status: 500 };
    }
    rows = rows.filter(item => item.question_id !== row.question_id);
    rows.push(row);
    return { question: row };
  }

  async function createQuestion({ askerId, question, force = false }) {
    const asker = toText(askerId).trim();
    if (!asker) return { error: "login required", status: 401 };
    if (asker.length > 64) return { error: "asker id too long", status: 400 };
    const text = toText(question).trim();
    if (text.length < 2) return { error: "question required", status: 400 };
    if (text.length > 2000) return { error: "question too long", status: 400 };
    const existing = rows.find(row => row.asker_id === asker && row.question === text && row.status === "pending");
    if (existing && !force) return { error: "question already submitted", status: 409, question: existing };
    const now = new Date().toISOString();
    const row = { question_id: "Q-" + crypto.randomBytes(5).toString("hex").toUpperCase(), asker_id: asker, question: text, asked_at: now, answer: null, answered_at: null, status: "pending", answered_by: "", updated_at: now };
    rows.push(row);
    if (useTable) {
      try {
        await query(`INSERT INTO qa_questions (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, insertParams(row));
      } catch (error) {
        rows = rows.filter(item => item !== row);
        if (error?.code === "ER_DUP_ENTRY") return { error: "question id conflict, retry", status: 409 };
        return { error: error?.message || "storage error", status: 500 };
      }
    } else {
      await persist();
    }
    return { question: row };
  }

  /** 回答或修正答案：置顶状态在回答后保持不变，其它状态转为 answered。 */
  async function answerQuestion({ questionId, answer, answeredBy: by }) {
    const id = toText(questionId).trim();
    if (!id || !QUESTION_ID_RE.test(id)) return { error: "invalid question id", status: 400 };
    const text = toText(answer).trim();
    if (!text) return { error: "answer required", status: 400 };
    if (text.length > 4000) return { error: "answer too long", status: 400 };
    const row = rows.find(item => String(item.question_id).toUpperCase() === id.toUpperCase());
    if (!row) return { error: "question not found", status: 404 };
    const now = new Date().toISOString();
    const author = toText(by).trim() || answeredBy;
    const status = row.status === "pinned" ? "pinned" : "answered";
    const previous = { answer: row.answer, answered_at: row.answered_at, status: row.status, answered_by: row.answered_by, updated_at: row.updated_at };
    row.answer = text;
    row.answered_at = now;
    row.answered_by = author;
    row.status = status;
    row.updated_at = now;
    if (useTable) {
      try {
        await query("UPDATE qa_questions SET answer = ?, answered_at = ?, answered_by = ?, status = ?, updated_at = ? WHERE question_id = ?", [row.answer, toSqlTimestamp(row.answered_at), author, status, toSqlTimestamp(now), row.question_id]);
      } catch (error) {
        Object.assign(row, previous);
        return { error: error?.message || "storage error", status: 500 };
      }
    } else {
      await persist();
    }
    return { question: row };
  }

  /**
   * 主办方调整状态：置顶 / 显示 / 隐藏 / 打回待回答。
   * 置顶与显示都要求已有答案；隐藏保留原答案，便于之后再公开；
   * 已经有答案的问题不允许退回 pending（后台下拉框也不会给这个选项）。
   */
  async function setStatus({ questionId, status, answeredBy: by }) {
    const id = toText(questionId).trim();
    if (!id || !QUESTION_ID_RE.test(id)) return { error: "invalid question id", status: 400 };
    const next = normalizeStatus(status);
    if (toText(status).trim().toLowerCase() !== next) return { error: "invalid status", status: 400 };
    const row = rows.find(item => String(item.question_id).toUpperCase() === id.toUpperCase());
    if (!row) return { error: "question not found", status: 404 };
    if (["pinned", "answered"].includes(next) && !toNullableText(row.answer)) return { error: "answer required before publishing", status: 400 };
    if (next === "pending" && toNullableText(row.answer)) return { error: "answered question cannot go back to pending", status: 400 };
    const now = new Date().toISOString();
    const author = toText(by).trim() || row.answered_by || answeredBy;
    const previous = { status: row.status, answered_by: row.answered_by, updated_at: row.updated_at };
    row.status = next;
    if (row.answer) row.answered_by = author;
    row.updated_at = now;
    if (useTable) {
      try {
        await query("UPDATE qa_questions SET status = ?, answered_by = ?, updated_at = ? WHERE question_id = ?", [next, row.answered_by, toSqlTimestamp(now), row.question_id]);
      } catch (error) {
        Object.assign(row, previous);
        return { error: error?.message || "storage error", status: 500 };
      }
    } else {
      await persist();
    }
    return { question: row };
  }

  /** 等待尚未落盘的写入完成（测试或退出前调用）。 */
  function flush() {
    return queue.catch(() => {});
  }

  return { initialize, mode, list, listPublic, stats, createQuestion, putQuestion, answerQuestion, setStatus, flush };
}
