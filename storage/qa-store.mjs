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
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const QUESTION_ID_RE = /^[A-Za-z0-9-]{1,32}$/;
export const QA_STATUSES = Object.freeze(["pending", "answered"]);

const COLUMNS = "question_id, asker_id, question, asked_at, answer, answered_at, status, answered_by, updated_at";
const HYDRATE_SQL = `SELECT ${COLUMNS} FROM qa_questions ORDER BY asked_at DESC, question_id DESC`;
/** 表已存在但缺列时补齐（例如手工建表只写了 6 个字段），避免升级时启动失败。 */
const EXTRA_COLUMN_DDL = {
  status: "ALTER TABLE qa_questions ADD COLUMN status ENUM('pending','answered') NOT NULL DEFAULT 'pending'",
  answered_by: "ALTER TABLE qa_questions ADD COLUMN answered_by VARCHAR(64) NOT NULL DEFAULT ''",
  updated_at: "ALTER TABLE qa_questions ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
};

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

function normalizeStored(row) {
  return {
    question_id: toText(row?.question_id),
    asker_id: toText(row?.asker_id),
    question: toText(row?.question),
    asked_at: toIsoText(row?.asked_at),
    answer: toNullableText(row?.answer),
    answered_at: toIsoText(row?.answered_at),
    status: row?.status === "answered" ? "answered" : "pending",
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
        status ENUM('pending','answered') NOT NULL DEFAULT 'pending',
        answered_by VARCHAR(64) NOT NULL DEFAULT '',
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_qa_asker (asker_id),
        KEY idx_qa_status (status, asked_at),
        KEY idx_qa_asked_at (asked_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      const [existing] = await query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'qa_questions'");
      const present = new Set(existing.map(column => column.COLUMN_NAME || column.column_name));
      for (const [column, ddl] of Object.entries(EXTRA_COLUMN_DDL)) {
        if (!present.has(column)) await query(ddl);
      }
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

  /** 全部问答，新的在前。 */
  function list({ askerId, status } = {}) {
    return sortedDescending(
      rows.filter(row => {
        if (askerId && row.asker_id !== String(askerId)) return false;
        if (status && row.status !== status) return false;
        return true;
      })
    );
  }

  /** 公开 FAQ：只返回已回答的问题。 */
  function listAnswered() {
    return list({ status: "answered" });
  }

  function stats() {
    return {
      total: rows.length,
      pending: rows.filter(row => row.status === "pending").length,
      answered: rows.filter(row => row.status === "answered").length
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
    if (row.status === "answered" && !row.answered_at) row.answered_at = now;
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
    const previous = { answer: row.answer, answered_at: row.answered_at, status: row.status, answered_by: row.answered_by, updated_at: row.updated_at };
    row.answer = text;
    row.answered_at = now;
    row.answered_by = author;
    row.status = "answered";
    row.updated_at = now;
    if (useTable) {
      try {
        await query("UPDATE qa_questions SET answer = ?, answered_at = ?, answered_by = ?, status = 'answered', updated_at = ? WHERE question_id = ?", [row.answer, toSqlTimestamp(row.answered_at), author, toSqlTimestamp(now), row.question_id]);
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

  return { initialize, mode, list, listAnswered, stats, createQuestion, putQuestion, answerQuestion, flush };
}
