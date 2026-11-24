export interface SharingStatement {
  bind(...values: (string | number | null)[]): SharingStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
}

/** Implemented by D1 and by the local SQLite adapter. Batch must be transactional. */
export interface SharingDatabase {
  prepare(sql: string): SharingStatement;
  batch(statements: SharingStatement[]): Promise<unknown[]>;
}

export const SHARING_SCHEMA = `
CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  options_json TEXT NOT NULL,
  owner_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE TABLE IF NOT EXISTS share_participants (
  id TEXT PRIMARY KEY,
  share_id TEXT NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS share_participants_share ON share_participants(share_id);
CREATE TABLE IF NOT EXISTS share_votes (
  share_id TEXT NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES share_participants(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (share_id, participant_id)
);
CREATE TABLE IF NOT EXISTS share_comments (
  id TEXT PRIMARY KEY,
  share_id TEXT NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES share_participants(id) ON DELETE CASCADE,
  option_id TEXT,
  text TEXT NOT NULL,
  client_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (share_id, participant_id, client_id)
);
CREATE INDEX IF NOT EXISTS share_comments_share ON share_comments(share_id, created_at);
CREATE TABLE IF NOT EXISTS share_rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS share_rate_limits_expiry ON share_rate_limits(expires_at);`;
