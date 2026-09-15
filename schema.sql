CREATE DATABASE IF NOT EXISTS minicamp2026 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE minicamp2026;

CREATE TABLE IF NOT EXISTS app_state (
  state_key VARCHAR(64) NOT NULL PRIMARY KEY,
  state_json JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 问答信息（参与者提问、主办方回答）
-- question_id 即问题 id，是主键；asker_id 为提问人 id（报名编号，如 MC26-1001，对应 applications.id）
-- status 取值：pending 待回答（不公开）/ answered 已回答（公开）/ pinned 置顶（公开且排最前）/ hidden 隐藏（不公开，不删除）
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

-- 若已有旧库的 qa_questions（status 只有 pending/answered），服务启动时会自动升级枚举；
-- 想手工执行等价语句时：
-- ALTER TABLE qa_questions MODIFY COLUMN status ENUM('pending','answered','pinned','hidden') NOT NULL DEFAULT 'pending';
