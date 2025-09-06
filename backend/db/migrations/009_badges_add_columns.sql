-- 009_badges_add_columns.sql
-- Add missing columns to the badges table that earlier migrations assumed.

PRAGMA foreign_keys = OFF;

-- Add icon_image_id if missing
ALTER TABLE badges ADD COLUMN icon_image_id INTEGER;

-- Add created and updated timestamps expected by job code
ALTER TABLE badges ADD COLUMN created TEXT;
ALTER TABLE badges ADD COLUMN updated TEXT;

PRAGMA foreign_keys = ON;
