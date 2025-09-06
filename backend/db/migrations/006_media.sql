CREATE TABLE IF NOT EXISTS universes_media (
  universe_id  INTEGER NOT NULL,
  media_type   TEXT    NOT NULL,
  media_id     TEXT    NOT NULL,
  url          TEXT,
  last_seen_at TEXT,
  PRIMARY KEY (universe_id, media_type, media_id)
);
