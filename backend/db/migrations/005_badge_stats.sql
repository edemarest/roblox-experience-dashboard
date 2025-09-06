CREATE TABLE IF NOT EXISTS badge_stats_hourly (
  ts             TEXT    NOT NULL,
  badge_id       INTEGER NOT NULL,
  awarded_count  INTEGER,
  PRIMARY KEY (ts, badge_id)
);
