-- ResearchPulse schema (instruction.md section 2, SRS section 40.6).
-- Timestamps are ISO-8601 text in UTC.

CREATE TABLE IF NOT EXISTS departments (
  department_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,              -- CSE, ECE, MTH
  head_user_id INTEGER REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS users (
  user_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('RESEARCHER','RESEARCH_ADMIN','HOD')),
  account_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (account_status IN ('ACTIVE','DEACTIVATED')),
  department_id INTEGER REFERENCES departments(department_id),
  designation TEXT
);

CREATE TABLE IF NOT EXISTS publications (
  publication_id INTEGER PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,          -- 'P-1042'
  owner_id INTEGER NOT NULL REFERENCES users(user_id),
  title TEXT NOT NULL,
  authors TEXT NOT NULL,
  publication_type TEXT NOT NULL CHECK (publication_type IN
     ('JOURNAL','CONFERENCE','BOOK_CHAPTER','BOOK','PATENT','OTHER')),
  venue TEXT,
  year INTEGER NOT NULL CHECK (year >= 1900),
  doi_link TEXT,
  citation_count INTEGER NOT NULL DEFAULT 0 CHECK (citation_count >= 0),
  normalized_title TEXT NOT NULL,
  normalized_doi TEXT,
  status TEXT NOT NULL CHECK (status IN ('DRAFT_ENTERED','SUBMITTED','UNDER_REVIEW','VERIFIED','REJECTED')),
  duplicate_flag INTEGER NOT NULL DEFAULT 0,
  reviewer_id INTEGER REFERENCES users(user_id),   -- admin who opened it (UNDER_REVIEW)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  submitted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1                -- optimistic locking
);
CREATE INDEX IF NOT EXISTS ix_pub_owner_doi ON publications(owner_id, normalized_doi);
CREATE INDEX IF NOT EXISTS ix_pub_owner_title ON publications(owner_id, normalized_title, year);
CREATE INDEX IF NOT EXISTS ix_pub_status ON publications(status, submitted_at);

CREATE TABLE IF NOT EXISTS verifications (
  verification_id INTEGER PRIMARY KEY,
  publication_id INTEGER NOT NULL REFERENCES publications(publication_id) ON DELETE CASCADE,
  administrator_id INTEGER NOT NULL REFERENCES users(user_id),
  decision TEXT NOT NULL CHECK (decision IN ('VERIFIED','REJECTED')),
  comments TEXT,
  decision_date TEXT NOT NULL,
  CHECK (decision <> 'REJECTED' OR (comments IS NOT NULL AND trim(comments) <> ''))
);

CREATE TABLE IF NOT EXISTS status_history (  -- for the W05 status timeline
  id INTEGER PRIMARY KEY,
  publication_id INTEGER NOT NULL REFERENCES publications(publication_id) ON DELETE CASCADE,
  from_status TEXT, to_status TEXT NOT NULL,
  actor_id INTEGER NOT NULL REFERENCES users(user_id),
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS impact_metrics (
  metric_id INTEGER PRIMARY KEY,
  researcher_id INTEGER NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
  total_citations INTEGER NOT NULL DEFAULT 0,
  h_index INTEGER NOT NULL DEFAULT 0,
  i10_index INTEGER NOT NULL DEFAULT 0,
  verified_count INTEGER NOT NULL DEFAULT 0,
  computed_at TEXT,
  triggered_by TEXT                         -- public_id of the record that triggered it
);

CREATE TABLE IF NOT EXISTS notifications (
  notification_id INTEGER PRIMARY KEY,
  recipient_id INTEGER NOT NULL REFERENCES users(user_id),
  type TEXT NOT NULL CHECK (type IN ('NEW_RECORD_PENDING','PUBLICATION_VERIFIED','PUBLICATION_REJECTED')),
  message TEXT NOT NULL,
  publication_id INTEGER REFERENCES publications(publication_id) ON DELETE SET NULL,
  read_status TEXT NOT NULL DEFAULT 'UNREAD' CHECK (read_status IN ('UNREAD','READ')),
  email_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (email_status IN ('PENDING','SENT','FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (     -- insert-only (BR-010)
  log_id INTEGER PRIMARY KEY,
  action TEXT NOT NULL,                     -- 'VERIFY' | 'REJECT'
  actor_id INTEGER NOT NULL REFERENCES users(user_id),
  target_id TEXT NOT NULL,                  -- public_id, plain value (survives deletion)
  details TEXT,
  at TEXT NOT NULL
);

-- Counter for public IDs, so a deleted P-number is never handed out again.
CREATE TABLE IF NOT EXISTS sequences (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
