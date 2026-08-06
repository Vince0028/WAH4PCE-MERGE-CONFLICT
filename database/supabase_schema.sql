-- ============================================
-- ADAPT iPaaS Database Schema (Supabase #3)
-- Run this in the iPaaS Supabase SQL Editor
-- ============================================
-- The iPaaS logs all data exchange transactions.
-- Updated to support dynamic organization names and data format tracking.
-- Safe to re-run (uses DROP IF EXISTS).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DROP TABLE IF EXISTS adapt_transaction_logs CASCADE;

CREATE TABLE adapt_transaction_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

  -- Source and destination (now dynamic org names, not just iHOMIS/WAH)
  source_system VARCHAR(100) NOT NULL,
  destination_system VARCHAR(100) NOT NULL,

  -- Data format tracking
  source_format VARCHAR(20) NOT NULL DEFAULT 'HL7V2'
    CHECK (source_format IN ('HL7V2', 'FHIR_R4', 'CDA_R2')),
  destination_format VARCHAR(20) NOT NULL DEFAULT 'FHIR_R4'
    CHECK (destination_format IN ('HL7V2', 'FHIR_R4', 'CDA_R2')),

  -- Input: raw payload from source system
  raw_payload JSONB NOT NULL,

  -- Output: Transformed data for destination system
  transformed_payload JSONB,

  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'TRANSFORMING', 'SUCCESS', 'QUARANTINED')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adapt_status ON adapt_transaction_logs (status);
CREATE INDEX IF NOT EXISTS idx_adapt_source ON adapt_transaction_logs (source_system);
CREATE INDEX IF NOT EXISTS idx_adapt_dest ON adapt_transaction_logs (destination_system);
CREATE INDEX IF NOT EXISTS idx_adapt_src_fmt ON adapt_transaction_logs (source_format);
CREATE INDEX IF NOT EXISTS idx_adapt_dest_fmt ON adapt_transaction_logs (destination_format);
CREATE INDEX IF NOT EXISTS idx_adapt_created ON adapt_transaction_logs (created_at DESC);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS update_transaction_logs_modtime ON adapt_transaction_logs;
CREATE TRIGGER update_transaction_logs_modtime
  BEFORE UPDATE ON adapt_transaction_logs
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- RLS (open for prototype)
ALTER TABLE adapt_transaction_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for prototype" ON adapt_transaction_logs
  FOR ALL USING (true) WITH CHECK (true);
