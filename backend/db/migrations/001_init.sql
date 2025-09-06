-- 001_init.sql
PRAGMA foreign_keys = ON;

-- Creators (user or group)
CREATE TABLE creators (
  creator_id     INTEGER PRIMARY KEY,
  creator_type   TEXT NOT NULL CHECK (creator_type IN ('USER','GROUP')),
  name           TEXT,
  created_at     TEXT DEFAULT (datetime('now'))
);

-- Universes
CREATE TABLE universes (
  universe_id    INTEGER PRIMARY KEY,
  name           TEXT,
  description    TEXT,
  creator_id     INTEGER REFERENCES creators(creator_id) ON DELETE SET NULL,
  root_place_id  INTEGER,
  server_size    INTEGER, -- if known
  is_tracked     INTEGER NOT NULL DEFAULT 1, -- 1=true, 0=false
  created_at     TEXT,
  updated_at     TEXT,
  last_seen_at   TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_universes_tracked ON universes(is_tracked);
CREATE INDEX idx_universes_creator ON universes(creator_id);

-- Places
CREATE TABLE places (
  place_id       INTEGER PRIMARY KEY,
  universe_id    INTEGER NOT NULL REFERENCES universes(universe_id) ON DELETE CASCADE,
  name           TEXT,
  is_root        INTEGER NOT NULL DEFAULT 0,
  server_size    INTEGER
);

CREATE INDEX idx_places_universe ON places(universe_id);

-- Hourly backbone (time-series)
CREATE TABLE universe_stats_hourly (
  ts             TEXT NOT NULL,               -- ISO8601
  universe_id    INTEGER NOT NULL REFERENCES universes(universe_id) ON DELETE CASCADE,
  playing        INTEGER,
  visits_total   INTEGER,
  favorites_total INTEGER,
  up_votes       INTEGER,
  down_votes     INTEGER,
  PRIMARY KEY (ts, universe_id)
);

CREATE INDEX idx_stats_universe_ts ON universe_stats_hourly(universe_id, ts);
CREATE INDEX idx_stats_ts ON universe_stats_hourly(ts);

-- Live cache (latest snapshot)
CREATE TABLE universe_live_cache (
  universe_id    INTEGER PRIMARY KEY REFERENCES universes(universe_id) ON DELETE CASCADE,
  fetched_at     TEXT NOT NULL,
  playing        INTEGER,
  favorites_total INTEGER,
  up_votes       INTEGER,
  down_votes     INTEGER
);

-- Badges + hourly awards (optional early; keep table for future)
CREATE TABLE badges (
  badge_id       INTEGER PRIMARY KEY,
  universe_id    INTEGER NOT NULL REFERENCES universes(universe_id) ON DELETE CASCADE,
  name           TEXT,
  description    TEXT,
  icon_url       TEXT,
  enabled        INTEGER, -- 0/1
  created_at     TEXT,
  last_seen_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE badge_awards_hourly (
  ts             TEXT NOT NULL,
  badge_id       INTEGER NOT NULL REFERENCES badges(badge_id) ON DELETE CASCADE,
  awards_count   INTEGER,
  PRIMARY KEY (ts, badge_id)
);

CREATE INDEX idx_badge_awards_badge_ts ON badge_awards_hourly(badge_id, ts);

-- Versioned metadata for diffs (name/description/icon)
CREATE TABLE universe_versions (
  universe_id    INTEGER NOT NULL REFERENCES universes(universe_id) ON DELETE CASCADE,
  ts             TEXT NOT NULL,
  name           TEXT,
  description    TEXT,
  icon_hash      TEXT,      -- hash or etag of icon
  title_hash     TEXT,      -- precomputed to detect change quickly
  desc_hash      TEXT,
  PRIMARY KEY (universe_id, ts)
);

-- Events/annotations (icon change, desc change, publish, manual)
CREATE TABLE universe_events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ts             TEXT NOT NULL,
  universe_id    INTEGER NOT NULL REFERENCES universes(universe_id) ON DELETE CASCADE,
  event_type     TEXT NOT NULL, -- ICON_CHANGED | DESC_CHANGED | PUBLISH | NOTE | ...
  meta           TEXT           -- JSON string
);

CREATE INDEX idx_events_universe_ts ON universe_events(universe_id, ts);

-- Precomputed trending scores (updated hourly)
CREATE TABLE trending_scores_hourly (
  ts             TEXT NOT NULL,
  universe_id    INTEGER NOT NULL REFERENCES universes(universe_id) ON DELETE CASCADE,
  dz_playing_1h  REAL,   -- velocity z-score
  accel          REAL,
  sustain_6h     REAL,
  wilson_score   REAL,
  rank_bucket    INTEGER,
  PRIMARY KEY (ts, universe_id)
);

CREATE INDEX idx_trending_ts ON trending_scores_hourly(ts);

-- Watchlists (for alerts later)
CREATE TABLE watches (
  watch_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        TEXT,  -- your auth user id (uuid/string)
  universe_id    INTEGER NOT NULL REFERENCES universes(universe_id) ON DELETE CASCADE,
  thresholds     TEXT,  -- JSON: {"dz_playing_1h":2.5,"wilson_min":0.6}
  channels       TEXT,  -- JSON: {"email":"...","discord":"..."}
  created_at     TEXT DEFAULT (datetime('now'))
);

-- Full-text search (name/description)
CREATE VIRTUAL TABLE universes_fts USING fts5(
  name, description,
  content='universes', content_rowid='universe_id'
);

-- FTS sync triggers
CREATE TRIGGER universes_ai AFTER INSERT ON universes BEGIN
  INSERT INTO universes_fts(rowid, name, description)
  VALUES (new.universe_id, new.name, new.description);
END;
CREATE TRIGGER universes_ad AFTER DELETE ON universes BEGIN
  INSERT INTO universes_fts(universes_fts, rowid, name, description)
  VALUES('delete', old.universe_id, old.name, old.description);
END;
CREATE TRIGGER universes_au AFTER UPDATE ON universes BEGIN
  INSERT INTO universes_fts(universes_fts, rowid, name, description)
  VALUES('delete', old.universe_id, old.name, old.description);
  INSERT INTO universes_fts(rowid, name, description)
  VALUES (new.universe_id, new.name, new.description);
END;

-- Convenience view for "latest"
CREATE VIEW current_universe_metrics AS
WITH latest AS (
  SELECT universe_id, MAX(ts) AS ts
  FROM universe_stats_hourly GROUP BY universe_id
)
SELECT u.universe_id, u.name, u.creator_id, s.ts, s.playing, s.visits_total,
       s.favorites_total, s.up_votes, s.down_votes
FROM universes u
JOIN latest l USING (universe_id)
JOIN universe_stats_hourly s ON s.universe_id=l.universe_id AND s.ts=l.ts;
