-- db/003_trending.sql
BEGIN;
CREATE TABLE IF NOT EXISTS trending_scores_hourly (
  ts            TEXT    NOT NULL,
  universe_id   INTEGER NOT NULL,
  dz_playing_1h REAL,
  accel         REAL,
  sustain_6h    REAL,
  wilson_score  REAL,
  rank_bucket   INTEGER,
  PRIMARY KEY (ts, universe_id)
);
COMMIT;
