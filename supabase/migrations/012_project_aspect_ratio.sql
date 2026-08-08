-- Add aspect_ratio to projects (default 9:16 for social-first real estate)
ALTER TABLE projects ADD COLUMN aspect_ratio TEXT NOT NULL DEFAULT '9:16';
