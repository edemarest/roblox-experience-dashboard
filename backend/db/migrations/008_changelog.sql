CREATE TABLE IF NOT EXISTS universe_changelog (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           TEXT    NOT NULL,
  universe_id  INTEGER NOT NULL,
  kind         TEXT    NOT NULL,
  before_json  TEXT,
  after_json   TEXT
);
CREATE INDEX IF NOT EXISTS idx_changelog_universe_ts ON universe_changelog(universe_id, ts DESC);
