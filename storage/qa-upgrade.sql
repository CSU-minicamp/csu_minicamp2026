-- 生产库增量升级：只新增 qa_questions 表，不触碰 app_state 与既有数据。
-- 用法（在已部署服务器上执行）：
--   mysql -h 127.0.0.1 -u <user> -p <database> < storage/qa-upgrade.sql
-- 也可以直接重启 Node 服务：服务启动时会自动执行等价的 CREATE TABLE IF NOT EXISTS，
-- 并在 status 缺少 pinned/hidden 时自动执行下面的 MODIFY COLUMN。
-- 无论哪种方式，都不要执行 schema.sql 里的 DROP/重建操作，本脚本只做新增。

CREATE DATABASE IF NOT EXISTS minicamp2026 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE minicamp2026;

CREATE TABLE IF NOT EXISTS qa_questions (
  question_id VARCHAR(32) NOT NULL PRIMARY KEY COMMENT '问题ID，形如 Q-1A2B3C4D5E',
  asker_id VARCHAR(64) NOT NULL COMMENT '提问人ID，报名编号如 MC26-1001',
  question TEXT NOT NULL COMMENT '问题内容',
  asked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '提问时间',
  answer TEXT NULL COMMENT '答案，未回答为 NULL',
  answered_at TIMESTAMP NULL DEFAULT NULL COMMENT '回答时间，未回答为 NULL',
  status ENUM('pending','answered','pinned','hidden') NOT NULL DEFAULT 'pending' COMMENT '状态：待回答/已回答/置顶/隐藏',
  answered_by VARCHAR(64) NOT NULL DEFAULT '' COMMENT '回答人（主办方）',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY idx_qa_asker (asker_id),
  KEY idx_qa_status (status, asked_at),
  KEY idx_qa_asked_at (asked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='问答信息';

-- 已经手工建过只有 6 个字段的 qa_questions 时，补齐辅助字段。
-- MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS，若已存在会报 1060，可忽略后继续。
-- ALTER TABLE qa_questions ADD COLUMN status ENUM('pending','answered','pinned','hidden') NOT NULL DEFAULT 'pending';
-- ALTER TABLE qa_questions ADD COLUMN answered_by VARCHAR(64) NOT NULL DEFAULT '';
-- ALTER TABLE qa_questions ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
