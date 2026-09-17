CREATE DATABASE IF NOT EXISTS minicamp2026 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE minicamp2026;

CREATE TABLE IF NOT EXISTS app_state (
  state_key VARCHAR(64) NOT NULL PRIMARY KEY,
  state_json JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 问答信息（参与者提问、主办方回答）
-- question_id 即问题 id，是主键；asker_id 为提问人 id（报名编号，如 MC26-1001，对应 applications.id）
-- parent_question_id 为追问的父问题（NULL = 原始问题，即一个会话的根）
-- status 取值：pending 待回答（不公开）/ answered 已回答（公开）/ pinned 置顶（公开且排最前）/ hidden 隐藏（不公开，不删除）
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
  -- 故意不加 parent_question_id 的自引用外键：ON DELETE CASCADE 会沿自引用链级联，
  -- InnoDB 报 "Foreign key cascade delete/update exceeds max tables limit of 30"，反而删不掉。
  -- 删整条会话请用 store.deleteSession()（应用层显式删除根 + 追问 + qa_threads 行）。
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='问答信息';

-- 问答会话与追问关系：一行 = 一个会话（根问题），记录层级与最近活动时间
-- 这里的两个外键都指向别的表（非自引用），ON DELETE CASCADE 不会触发上述级联问题，保留。
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

-- 旧库升级（服务启动时也会自动执行等价语句，不需要手工改表）：
-- ALTER TABLE qa_questions ADD COLUMN parent_question_id VARCHAR(32) NULL AFTER asker_id;
-- ALTER TABLE qa_questions ADD KEY idx_qa_parent (parent_question_id);
-- CREATE TABLE IF NOT EXISTS qa_threads ( ... 同上 ... );
-- 若你的库里已经存在 fk_qa_parent 自引用外键，建议删掉它，否则删除父问题会报 max tables limit：
-- ALTER TABLE qa_questions DROP FOREIGN KEY fk_qa_parent;

-- 若已有旧库的 qa_questions（status 只有 pending/answered），服务启动时会自动升级枚举；
-- 想手工执行等价语句时：
-- ALTER TABLE qa_questions MODIFY COLUMN status ENUM('pending','answered','pinned','hidden') NOT NULL DEFAULT 'pending';
