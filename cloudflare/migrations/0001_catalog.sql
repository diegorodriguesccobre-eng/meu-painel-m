CREATE TABLE IF NOT EXISTS catalog_heads (
  seller_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  mutation_id TEXT NOT NULL DEFAULT '',
  digest TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS catalog_chunks (
  seller_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  position INTEGER NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (seller_id, revision, position)
);
