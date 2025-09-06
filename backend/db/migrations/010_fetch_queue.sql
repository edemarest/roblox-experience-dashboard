-- Migration 010: add fetch tracking columns to universes
BEGIN;
ALTER TABLE universes ADD COLUMN last_fetch_run_id TEXT;
ALTER TABLE universes ADD COLUMN last_fetch_status TEXT;
ALTER TABLE universes ADD COLUMN last_fetch_started_at TEXT;
ALTER TABLE universes ADD COLUMN last_fetch_finished_at TEXT;
COMMIT;
