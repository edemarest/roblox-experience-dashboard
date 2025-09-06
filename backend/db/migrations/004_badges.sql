CREATE TABLE IF NOT EXISTS badges (
  badge_id      INTEGER PRIMARY KEY,
  universe_id   INTEGER NOT NULL,
  name          TEXT,
  description   TEXT,
  enabled       INTEGER,
  icon_image_id INTEGER,
  created       TEXT,
  updated       TEXT
);
CREATE INDEX IF NOT EXISTS idx_badges_universe ON badges(universe_id);
