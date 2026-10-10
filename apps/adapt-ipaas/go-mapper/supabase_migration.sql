-- Run this in your Supabase SQL editor

-- 1. Settings table for AI toggle persistence
CREATE TABLE IF NOT EXISTS adapt_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO adapt_settings (key, value)
VALUES ('ai_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

-- 2. Add transform_engine column to track AI vs Algorithm per transaction
ALTER TABLE adapt_transaction_logs
  ADD COLUMN IF NOT EXISTS transform_engine TEXT DEFAULT NULL;

-- Values will be one of:
--   'AI'               → transformed by Gemma 4 9B (or other AI model)
--   'Algorithm'        → transformed by Go Deterministic Mapper
--   'Algorithm (TS)'   → transformed by TS fallback (Go offline)
--   'Fallback'         → AI failed, fell back to algorithm
