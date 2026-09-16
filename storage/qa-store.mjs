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
 *   qa_questions：question_id(PK) / asker_id / parent_question_id / question / asked_at
 *                 + answer / answered_at / status / answered_by / updated_at
 *   qa_threads   ：问答会话与追问关系：root_question_id(PK) / parent_question_id / depth / last_activity_at
 *
 * 追问：parent_question_id 指向被追问的那条问题，NULL 表示原始问题（会话根）。
 *   每条追问都是 qa_questions 里独立的一行，自带状态与答案，可以继续被追问（不限层数）；
 *   新建追问时在 qa_threads 里按会话根 UPSERT 一行，记录层级与会话最近活动时间。
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
/** 追问的兜底层数上限（防止异常数据形成环）。 */
const MAX_FOLLOW_UP_DEPTH = 64;

const COLUMNS = "question_id, asker_id, parent_question_id, question, asked_at, answer, answered_at, status, answered_by, updated_at";
const HYDRATE_SQL = `SELECT ${COLUMNS} FROM qa_questions ORDER BY asked_at DESC, question_id DESC`;
const THREAD_COLUMNS = "root_question_id, parent_question_id, depth, last_activity_at, created_at, updated_at";
const THREAD_HYDRATE_SQL = `SELECT ${THREAD_COLUMNS} FROM qa_threads`;
const CREATE_THREADS_SQL = `CREATE TABLE IF NOT EXISTS qa_threads (
  root_question_id VARCHAR(32) NOT NULL PRIMARY KEY,
  parent_question_id VARCHAR(32) NOT NULL,
  depth TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_thread_parent (parent_question_id),
  KEY idx_thread_activity (last_activity_at),
  CONSTRAINT fk_thread_root FOREIGN KEY (root_question_id) REFERENCES qa_questions (question_id) ON DELETE CASCADE,
  CONSTRAINT fk_thread_parent FOREIGN KEY (parent_question_id) REFERENCES qa_questions (question_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
/** 表已存在但缺列时补齐（例如手工建表只写了 6 个字段），避免升级时启动失败。 */
const EXTRA_COLUMN_DDL = {
  parent_question_id: "ALTER TABLE qa_questions ADD COLUMN parent_question_id VARCHAR(32) NULL AFTER asker_id",
  status: "ALTER TABLE qa_questions ADD COLUMN status ENUM('pending','answered','pinned','hidden') NOT NULL DEFAULT 'pending'",
  answered_by: "ALTER TABLE qa_questions ADD COLUMN answered_by VARCHAR(64) NOT NULL DEFAULT ''",
  updated_at: "ALTER TABLE qa_questions ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
};
/** 旧库的 status 可能只有 pending/answered 两种取值，缺值就升级枚举。 */
const STATUS_ENUM_DDL = "ALTER TABLE qa_questions MODIFY COLUMN status ENUM('pending','answered','pinned','hidden') NOT NULL DEFAULT 'pending'";
/** 旧库还没有 parent 索引时补上（MySQL 不支持 ADD KEY IF NOT EXISTS，失败即视为已存在）。 */
const RELATION_DDL = [
  "ALTER TABLE qa_questions ADD KEY idx_qa_parent (parent_question_id)"
];
/**
 * 旧的 qa_questions 可能被建过自引用外键（parent_question_id → question_id）：
 * 自引用 + ON DELETE CASCADE 在删除父行时会沿链级联，InnoDB 直接报
 * "Foreign key cascade delete/update exceeds max tables limit of 30"，反而删不掉整条会话。
 * 启动时尝试删掉它；删整条会话用 deleteSession()（应用层显式删除）。
 */
const DROP_SELF_FK_DDL = "ALTER TABLE qa_questions DROP FOREIGN KEY fk_qa_parent";

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
    parent_question_id: toNullableText(row?.parent_question_id),
    question: toText(row?.question),
    asked_at: toIsoText(row?.asked_at),
    answer: toNullableText(row?.answer),
    answered_at: toIsoText(row?.answered_at),
    status: normalizeStatus(row?.status),
    answered_by: toText(row?.answered_by),
    updated_at: toIsoText(row?.updated_at)
  };
}

function normalizeThread(row) {
  return {
    root_question_id: toText(row?.root_question_id),
    parent_question_id: toText(row?.parent_question_id),
    depth: Number.isFinite(Number(row?.depth)) ? Number(row.depth) : 0,
    last_activity_at: toIsoText(row?.last_activity_at),
    created_at: toIsoText(row?.created_at),
    updated_at: toIsoText(row?.updated_at)
  };
}

/** 按提问时间升序（用在一条会话内部：先问的在前）。 */
function sortedAscending(rows) {
  return [...rows].sort((a, b) => {
    const diff = String(a.asked_at || "").localeCompare(String(b.asked_at || ""));
    return diff !== 0 ? diff : String(a.question_id).localeCompare(String(b.question_id));
  });
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
  let threads = new Map();
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

  /** 从某条问题往上走到会话根，返回 { rootId, depth }；遇到环或断链就停在能确定的位置。 */
  function ancestorsOf(questionId) {
    const chain = [];
    const seen = new Set();
    let current = rows.find(row => row.question_id === questionId);
    while (current) {
      if (seen.has(current.question_id) || chain.length > MAX_FOLLOW_UP_DEPTH) break;
      seen.add(current.question_id);
      chain.push(current);
      if (!current.parent_question_id) break;
      current = rows.find(row => row.question_id === current.parent_question_id);
    }
    const root = chain[chain.length - 1];
    return { rootId: root?.question_id || "", depth: Math.max(chain.length - 1, 0) };
  }

  async function initialize() {
    try {
      if (!getPool()) throw new Error("MySQL unavailable");
      await query(`CREATE TABLE IF NOT EXISTS qa_questions (
        question_id VARCHAR(32) NOT NULL PRIMARY KEY,
        asker_id VARCHAR(64) NOT NULL,
        parent_question_id VARCHAR(32) NULL,
        question TEXT NOT NULL,
        asked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        answer TEXT NULL,
        answered_at TIMESTAMP NULL DEFAULT NULL,
        status ENUM('pending','answered','pinned','hidden') NOT NULL DEFAULT 'pending',
        answered_by VARCHAR(64) NOT NULL DEFAULT '',
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_qa_asker (asker_id),
        KEY idx_qa_parent (parent_question_id),
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
      // 旧库还没有 parent 索引/自引用外键时处理：补索引、去掉会导致级联超限的自引用外键。
      for (const ddl of RELATION_DDL) await query(ddl).catch(() => {});
      await query(DROP_SELF_FK_DDL).catch(() => {});
      await query(CREATE_THREADS_SQL);
      // 自愈：外键是在 parent 列之后才补上的，历史数据里可能留下"父问题已删、追问还在"的孤儿行。
      await query("DELETE child FROM qa_questions child LEFT JOIN qa_questions parent ON parent.question_id = child.parent_question_id WHERE child.parent_question_id IS NOT NULL AND parent.question_id IS NULL").catch(() => {});
      rows = (await query(HYDRATE_SQL))[0].map(normalizeStored);
      threads = new Map((await query(THREAD_HYDRATE_SQL))[0].map(thread => [normalizeThread(thread).root_question_id, normalizeThread(thread)]));
      useTable = true;
    } catch (error) {
      useTable = false;
      rows = await readFallback();
      threads = new Map();
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
   * @param {boolean} [options.rootsOnly] 只返回原始问题（会话根），排除追问
   * @param {boolean} [options.publicOrder] true 时置顶排最前（公开列表用）
   */
  function list({ askerId, status, rootsOnly = false, publicOrder: byPin } = {}) {
    const wanted = status === undefined || status === null ? null : (Array.isArray(status) ? status : [status]);
    const filtered = rows.filter(row => {
      if (askerId && row.asker_id !== String(askerId)) return false;
      if (rootsOnly && row.parent_question_id) return false;
      if (wanted && !wanted.includes(row.status)) return false;
      return true;
    });
    return byPin ? publicOrder(filtered) : sortedDescending(filtered);
  }

  /** 公开 FAQ：只返回会话根（追问跟随根一起展示），置顶在最前，然后是已回答。 */
  function listPublic() {
    return list({ status: [...QA_PUBLIC_STATUSES], rootsOnly: true, publicOrder: true });
  }

  /** 一条会话的全部条目（根 + 所有层级的追问），按提问时间升序，包含未公开状态（调用方负责过滤）。 */
  function listSession(rootQuestionId) {
    const rootId = toText(rootQuestionId).trim();
    if (!rootId) return [];
    const ids = new Set([rootId]);
    let growing = true;
    while (growing) {
      growing = false;
      for (const row of rows) {
        if (row.parent_question_id && ids.has(row.parent_question_id) && !ids.has(row.question_id)) {
          ids.add(row.question_id);
          growing = true;
        }
      }
    }
    return sortedAscending(rows.filter(row => ids.has(row.question_id)));
  }

  /** 会话关系表内容（qa_threads）。 */
  function listThreads() {
    return [...threads.values()];
  }

  function threadInfo(rootQuestionId) {
    return threads.get(toText(rootQuestionId).trim()) || null;
  }

  /** 任意一条问题（含追问）所属的会话根，以及它的层级。 */
  function rootOf(questionId) {
    const { rootId, depth } = ancestorsOf(toText(questionId).trim());
    return { rootQuestionId: rootId, depth };
  }

  /**
   * 删除整条会话（根 + 所有层级的追问 + qa_threads 行）。
   * 应用层显式删除，不依赖自引用外键级联（见 RELATION_DDL 的说明）。
   */
  async function deleteSession(rootQuestionId) {
    const rootId = toText(rootQuestionId).trim();
    if (!rootId) return { error: "root question required", status: 400 };
    if (!rows.some(row => row.question_id === rootId)) return { error: "question not found", status: 404 };
    const ids = listSession(rootId).map(row => row.question_id);
    rows = rows.filter(row => !ids.includes(row.question_id));
    threads.delete(rootId);
    if (useTable) {
      try {
        await query("DELETE FROM qa_questions WHERE question_id IN (?)", [ids]);
      } catch (error) {
        // 6575 = ER_FK_CASCADE_DEPTH_EXCEEDED：库里还留着自引用外键，提示怎么处理。
        if (error?.errno === 6575) return { error: "self-referencing foreign key blocks deleting a session; run: ALTER TABLE qa_questions DROP FOREIGN KEY fk_qa_parent", status: 409 };
        return { error: error?.message || "storage error", status: 500 };
      }
      await query("DELETE FROM qa_threads WHERE root_question_id = ?", [rootId]);
    } else {
      await persist();
    }
    return { deleted: ids };
  }

  /** 问答统计：总数含追问，roots/followUps 分开计数。 */
  function stats() {
    const count = status => rows.filter(row => row.status === status).length;
    const followUps = rows.filter(row => row.parent_question_id).length;
    return {
      total: rows.length,
      roots: rows.length - followUps,
      followUps,
      pending: count("pending"),
      answered: count("answered"),
      pinned: count("pinned"),
      hidden: count("hidden")
    };
  }

  /** 内存行 → INSERT 参数，保证列顺序与 COLUMNS 一致。 */
  function insertParams(row) {
    return [row.question_id, row.asker_id, row.parent_question_id, row.question, toSqlTimestamp(row.asked_at), row.answer, toSqlTimestamp(row.answered_at), row.status, row.answered_by, toSqlTimestamp(row.updated_at)];
  }

  /** 写入/更新会话行（qa_threads）。同一会话只保留一行，追问加深时更新 depth 与活动时间。 */
  async function upsertThread(rootQuestionId, depth, at) {
    const existing = threads.get(rootQuestionId);
    const next = {
      root_question_id: rootQuestionId,
      parent_question_id: rootQuestionId,
      depth: Math.max(Number.isFinite(depth) ? depth : 0, existing?.depth || 0),
      last_activity_at: at,
      created_at: existing?.created_at || at,
      updated_at: at
    };
    threads.set(rootQuestionId, next);
    if (!useTable) {
      await persist();
      return;
    }
    await query(
      `INSERT INTO qa_threads (root_question_id, parent_question_id, depth, last_activity_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE depth = GREATEST(depth, VALUES(depth)), last_activity_at = VALUES(last_activity_at), updated_at = VALUES(updated_at)`,
      [next.root_question_id, next.parent_question_id, next.depth, toSqlTimestamp(at), toSqlTimestamp(next.created_at), toSqlTimestamp(at)]
    );
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
      await registerThreadFor(row);
      await persist();
      return { question: row };
    }
    try {
      if (record.replace) await query("DELETE FROM qa_questions WHERE question_id = ?", [row.question_id]);
      await query(`INSERT INTO qa_questions (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, insertParams(row));
    } catch (error) {
      if (error?.code === "ER_DUP_ENTRY") return { error: "question id already exists", status: 409 };
      return { error: error?.message || "storage error", status: 500 };
    }
    rows = rows.filter(item => item.question_id !== row.question_id);
    rows.push(row);
    await registerThreadFor(row);
    return { question: row };
  }

  /**
   * 保证一条问题在 qa_threads 里有对应会话行：
   *   根问题 → depth 0；追问 → 会话根 + 父层级+1。
   * 导入（putQuestion）与新建都走这里，避免出现"有追问但查不到会话"的情况。
   */
  async function registerThreadFor(row) {
    if (row.parent_question_id) {
      const { rootId, depth } = ancestorsOf(row.parent_question_id);
      if (rootId) await upsertThread(rootId, depth + 1, row.asked_at);
      return;
    }
    await upsertThread(row.question_id, 0, row.asked_at);
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
    const row = { question_id: "Q-" + crypto.randomBytes(5).toString("hex").toUpperCase(), asker_id: asker, parent_question_id: null, question: text, asked_at: now, answer: null, answered_at: null, status: "pending", answered_by: "", updated_at: now };
    rows.push(row);
    if (useTable) {
      try {
        await query(`INSERT INTO qa_questions (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, insertParams(row));
        // 原始问题同时登记一条会话行（depth 0），追问会在此基础上加深。
        await upsertThread(row.question_id, 0, now);
      } catch (error) {
        rows = rows.filter(item => item !== row);
        if (error?.code === "ER_DUP_ENTRY") return { error: "question id conflict, retry", status: 409 };
        return { error: error?.message || "storage error", status: 500 };
      }
    } else {
      threads.set(row.question_id, { root_question_id: row.question_id, parent_question_id: row.question_id, depth: 0, last_activity_at: now, created_at: now, updated_at: now });
      await persist();
    }
    return { question: row };
  }

  /**
   * 新建追问：只有原提问者本人能追问自己的问题，父问题必须存在。
   * 每条追问都是独立一行（自己的状态与答案），可以继续被追问（不限层数）。
   */
  async function createFollowUp({ askerId, parentQuestionId, question }) {
    const asker = toText(askerId).trim();
    if (!asker) return { error: "login required", status: 401 };
    const parentId = toText(parentQuestionId).trim();
    if (!parentId) return { error: "parent question required", status: 400 };
    const parent = rows.find(row => String(row.question_id).toUpperCase() === parentId.toUpperCase());
    if (!parent) return { error: "parent question not found", status: 404 };
    if (parent.asker_id !== asker) return { error: "only the original asker can follow up", status: 403 };
    // 只有已经被回答过的问题才能追问：还没有答案时追问无从谈起。
    if (!toNullableText(parent.answer)) return { error: "parent question is not answered yet", status: 409 };
    const text = toText(question).trim();
    if (text.length < 2) return { error: "question required", status: 400 };
    if (text.length > 2000) return { error: "question too long", status: 400 };
    const duplicated = rows.find(row => row.parent_question_id === parent.question_id && row.asker_id === asker && row.question === text);
    if (duplicated) return { error: "follow up already submitted", status: 409, question: duplicated };

    const { rootId, depth } = ancestorsOf(parent.question_id);
    const row = {
      question_id: "Q-" + crypto.randomBytes(5).toString("hex").toUpperCase(),
      asker_id: asker,
      parent_question_id: parent.question_id,
      question: text,
      asked_at: new Date().toISOString(),
      answer: null,
      answered_at: null,
      status: "pending",
      answered_by: "",
      updated_at: new Date().toISOString()
    };
    rows.push(row);
    try {
      if (useTable) {
        await query(`INSERT INTO qa_questions (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, insertParams(row));
      }
      // 会话行记录"这条追问的层级"，即父问题层级 + 1；表模式与回退模式都要更新。
      if (rootId) await upsertThread(rootId, depth + 1, row.asked_at);
      if (!useTable) await persist();
    } catch (error) {
      rows = rows.filter(item => item !== row);
      if (error?.code === "ER_DUP_ENTRY") return { error: "question id conflict, retry", status: 409 };
      return { error: error?.message || "storage error", status: 500 };
    }
    return { question: row, rootQuestionId: rootId, depth: depth + 1 };
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

  return { initialize, mode, list, listPublic, listSession, listThreads, threadInfo, rootOf, deleteSession, stats, createQuestion, createFollowUp, putQuestion, answerQuestion, setStatus, flush };
}
