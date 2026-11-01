CREATE TABLE submissions (
 id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'uploading', metadata TEXT NOT NULL,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, ip_hash TEXT NOT NULL,
 release_id INTEGER, files TEXT NOT NULL DEFAULT '{}', reason TEXT NOT NULL DEFAULT '',
 lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0, commit_sha TEXT,
 CHECK(status IN ('uploading','pending','publishing','published','rejected','withdrawing','withdrawn','publish_failed','expired'))
);
CREATE INDEX submissions_created ON submissions(created_at);
CREATE INDEX submissions_status ON submissions(status,created_at);
CREATE INDEX submissions_ip ON submissions(ip_hash,created_at);
CREATE TABLE events (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, submission_id TEXT NOT NULL, at INTEGER NOT NULL,
 actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX events_submission ON events(submission_id,seq);
CREATE TABLE oauth_states (state_hash TEXT PRIMARY KEY, verifier TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
