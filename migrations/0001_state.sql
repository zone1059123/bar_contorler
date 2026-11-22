CREATE TABLE IF NOT EXISTS bar_revision (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
--> statement-breakpoint
INSERT OR IGNORE INTO bar_revision (id, revision) VALUES (1, 0);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL CHECK (price >= 0),
  ml REAL CHECK (ml > 0),
  ingredient TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS inventory_events (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id),
  type TEXT NOT NULL CHECK (type IN ('count','receipt','transfer','order','calibration','cogs')),
  occurred_at INTEGER NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS inventory_events_item_time ON inventory_events (item_id, occurred_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sales (
  date TEXT PRIMARY KEY,
  beverage REAL CHECK (beverage >= 0),
  overall REAL CHECK (overall >= 0),
  extra REAL CHECK (extra >= 0),
  CHECK (beverage <= overall)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS applied_operations (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL
);
