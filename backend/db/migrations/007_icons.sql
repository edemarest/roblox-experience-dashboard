CREATE TABLE IF NOT EXISTS universe_icons (
  universe_id  INTEGER NOT NULL,
  size         TEXT    NOT NULL,
  url          TEXT    NOT NULL,
  url_hash     TEXT,
  last_seen_at TEXT,
  PRIMARY KEY (universe_id, size)
);
