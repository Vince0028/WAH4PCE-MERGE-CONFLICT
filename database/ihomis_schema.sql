-- ============================================
-- iHOMIS Database Schema (Supabase #1)
-- Run this in the iHOMIS Supabase SQL Editor
-- ============================================
-- iHOMIS uses HL7 v2 messaging for data exchange.
-- Data is stored as JSON with extracted metadata for search.
-- Same pattern as WAH (metadata + full payload as JSONB).
-- Safe to re-run (uses IF NOT EXISTS / DROP IF EXISTS).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop and recreate table (removes old schema with individual columns)
DROP TABLE IF EXISTS ihomis_patients CASCADE;

CREATE TABLE ihomis_patients (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

  -- Extracted metadata (for search/display)
  patient_name VARCHAR(200),
  philhealth_no VARCHAR(30),
  sex VARCHAR(1),
  dob DATE,
  diagnosis_code VARCHAR(20),
  diagnosis_desc TEXT,
  priority VARCHAR(20) DEFAULT 'ROUTINE',

  -- Full patient data as JSON (HL7 v2 fields stored as JSON object)
  hl7v2_payload JSONB NOT NULL,

  -- Raw source payload (original data before transformation, for comparison)
  raw_source_payload JSONB,

  -- Patient data privacy consent (RA 10173)
  consent_signed BOOLEAN DEFAULT FALSE,

  -- Record tracking
  status VARCHAR(20) DEFAULT 'SAVED' CHECK (status IN ('SAVED', 'QUEUED', 'SENT', 'RECEIVED', 'REJECTED')),
  source VARCHAR(20) DEFAULT 'LOCAL' CHECK (source IN ('LOCAL', 'RECEIVED')),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ihomis_status ON ihomis_patients (status);
CREATE INDEX IF NOT EXISTS idx_ihomis_source ON ihomis_patients (source);
CREATE INDEX IF NOT EXISTS idx_ihomis_philhealth ON ihomis_patients (philhealth_no);
CREATE INDEX IF NOT EXISTS idx_ihomis_created ON ihomis_patients (created_at DESC);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS update_ihomis_patients_modtime ON ihomis_patients;
CREATE TRIGGER update_ihomis_patients_modtime
  BEFORE UPDATE ON ihomis_patients
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- RLS (open for prototype)
ALTER TABLE ihomis_patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for prototype" ON ihomis_patients FOR ALL USING (true) WITH CHECK (true);
