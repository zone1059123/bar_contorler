CREATE TABLE IF NOT EXISTS order_drafts (
  item_id TEXT PRIMARY KEY REFERENCES items(id),
  qty INTEGER NOT NULL CHECK (qty > 0 AND qty <= 1000000)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS bar_undo (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL,
  kind TEXT NOT NULL,
  inverse TEXT NOT NULL CHECK (json_valid(inverse))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS login_attempts (
  client TEXT PRIMARY KEY,
  window_started INTEGER NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS bar_sessions (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS bar_sessions_expires ON bar_sessions (expires_at);
