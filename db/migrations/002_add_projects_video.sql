-- Migration: 002_add_projects_video.sql
-- Adds an optional 'video' text column to the projects table to store embed or direct video URLs.

BEGIN;

-- ensure column exists
ALTER TABLE IF EXISTS public.projects ADD COLUMN IF NOT EXISTS video text;

-- Optionally, backfill from any existing data if you have a CSV or mapping.

COMMIT;
