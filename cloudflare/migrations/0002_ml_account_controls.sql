-- Metadados e cotas: não modifica os cadastros existentes.
CREATE TABLE IF NOT EXISTS ml_account_controls (
 seller_id TEXT PRIMARY KEY,
 data_epoch INTEGER NOT NULL DEFAULT 0,
 enabled INTEGER NOT NULL DEFAULT 1,
 purged_at TEXT,
 refresh_owner TEXT,
 refresh_until INTEGER NOT NULL DEFAULT 0,
 refreshed_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ml_query_usage (
 seller_id TEXT PRIMARY KEY,
 minute INTEGER NOT NULL,
 minute_calls INTEGER NOT NULL,
 day INTEGER NOT NULL,
 day_calls INTEGER NOT NULL,
 blocked_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ml_session_checks (
 token_digest TEXT PRIMARY KEY,
 seller_id TEXT NOT NULL,
 verified_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 denied INTEGER NOT NULL DEFAULT 0
);
