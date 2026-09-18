-- 生产库增量升级：新增问答表结构（含追问），不触碰 app_state 与既有数据。
-- 用法（在已部署服务器上执行）：
--   mysql -h 127.0.0.1 -u <user> -p <database> < storage/qa-upgrade.sql
--
-- 也可以直接重启 Node 服务：启动时会自动执行等价的建表/加列/加索引/建关系表，
-- 并尝试清掉旧库里的自引用外键。两种方式任选其一。
-- 本脚本设计成可重复执行：已存在的列/索引会报 1060（Duplicate column）/1061（Duplicate key name），
-- 已存在的外键会报 1091（Can't DROP），这些错误都可以直接忽略，不影响后续语句。
-- 无论哪种方式，都不要执行 schema.sql 里的 DROP/重建操作，本脚本只做新增。

CREATE DATABASE IF NOT EXISTS minicamp2026 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE minicamp2026;

-- ① 问答信息（新建库时的完整定义）。parent_question_id 为追问的父问题，NULL = 原始问题。
CREATE TABLE IF NOT EXISTS qa_questions (
  question_id VARCHAR(32) NOT NULL PRIMARY KEY COMMENT '问题ID，形如 Q-1A2B3C4D5E',
  asker_id VARCHAR(64) NOT NULL COMMENT '提问人ID，报名编号如 MC26-1001',
  parent_question_id VARCHAR(32) NULL COMMENT '追问的父问题ID，NULL 表示原始问题',
  question TEXT NOT NULL COMMENT '问题内容',
  asked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '提问时间',
  answer TEXT NULL COMMENT '答案，未回答为 NULL',
  answered_at TIMESTAMP NULL DEFAULT NULL COMMENT '回答时间，未回答为 NULL',
  status ENUM('pending','answered','pinned','hidden') NOT NULL DEFAULT 'pending' COMMENT '状态：待回答/已回答/置顶/隐藏',
  answered_by VARCHAR(64) NOT NULL DEFAULT '' COMMENT '回答人（主办方）',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY idx_qa_asker (asker_id),
  KEY idx_qa_parent (parent_question_id),
  KEY idx_qa_status (status, asked_at),
  KEY idx_qa_asked_at (asked_at)
  -- 故意不加 parent_question_id 的自引用外键：自引用 + ON DELETE CASCADE 删父行时会沿链级联，
  -- InnoDB 报 "Foreign key cascade delete/update exceeds max tables limit of 30"，反而删不掉整条会话。
  -- 删整条会话走应用层 store.deleteSession()。
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='问答信息';

-- ② 问答会话与追问关系：一行 = 一个会话（根问题）。这两个外键指向别的表（非自引用），可以保留。
CREATE TABLE IF NOT EXISTS qa_threads (
  root_question_id VARCHAR(32) NOT NULL PRIMARY KEY COMMENT '会话根问题ID（最初的问题）',
  parent_question_id VARCHAR(32) NOT NULL COMMENT '与根相同的问题ID，便于单表按父查关系',
  depth TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '层级：根为 0，追问依次递增',
  last_activity_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '会话内最后一次提问/回答时间',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_thread_parent (parent_question_id),
  KEY idx_thread_activity (last_activity_at),
  CONSTRAINT fk_thread_root FOREIGN KEY (root_question_id) REFERENCES qa_questions (question_id) ON DELETE CASCADE,
  CONSTRAINT fk_thread_parent FOREIGN KEY (parent_question_id) REFERENCES qa_questions (question_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='问答会话与追问关系';

-- ③ 旧库（已经存在 qa_questions）补齐字段与索引：给追问加父指针。
ALTER TABLE qa_questions ADD COLUMN parent_question_id VARCHAR(32) NULL AFTER asker_id;
ALTER TABLE qa_questions ADD KEY idx_qa_parent (parent_question_id);

-- ④ 若旧库的 qa_questions 还没有这些辅助字段（更早版本），一并补上：
ALTER TABLE qa_questions ADD COLUMN status ENUM('pending','answered','pinned','hidden') NOT NULL DEFAULT 'pending';
ALTER TABLE qa_questions ADD COLUMN answered_by VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE qa_questions ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
-- 旧库的 status 只有 pending/answered 时升级枚举（这条重复执行是安全的）：
ALTER TABLE qa_questions MODIFY COLUMN status ENUM('pending','answered','pinned','hidden') NOT NULL DEFAULT 'pending';

-- ⑤ 若你的库里曾经建过 parent_question_id 的自引用外键，务必删掉，否则删除父问题会报 max tables limit。
--    没建过会报 1091（Can't DROP 'fk_qa_parent'），忽略即可：
ALTER TABLE qa_questions DROP FOREIGN KEY fk_qa_parent;

-- ⑥ 自愈：删掉"父问题已不存在"的历史孤儿追问行（外键是后加的，早期数据可能留下孤儿）：
DELETE child FROM qa_questions child
  LEFT JOIN qa_questions parent ON parent.question_id = child.parent_question_id
  WHERE child.parent_question_id IS NOT NULL AND parent.question_id IS NULL;

-- 升级后确认：
--   SHOW CREATE TABLE qa_questions;   -- 应看到 parent_question_id 与 idx_qa_parent
--   SELECT COUNT(*) FROM qa_threads;  -- 表存在即可，根问题在下次被追问时写入会话行
--   启动日志应出现 (qa storage: table)
