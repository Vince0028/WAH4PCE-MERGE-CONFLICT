-- ============================================
-- WAH Hospital Database Schema (Supabase #2)
-- Run this in the WAH Supabase SQL Editor
-- ============================================
-- WAH uses PH Core HL7 FHIR R4 for data exchange.
-- The full FHIR Bundle is stored as JSONB.
-- Safe to re-run (uses DROP IF EXISTS).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DROP TABLE IF EXISTS wah_patients CASCADE;

CREATE TABLE wah_patients (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

  -- Extracted metadata (for search/display)
  patient_name VARCHAR(200),
  philhealth_no VARCHAR(30),
  gender VARCHAR(10),
  birth_date DATE,
  diagnosis_code VARCHAR(20),
  diagnosis_display TEXT,

  -- Full FHIR R4 Bundle (Patient, Encounter, Observation, Condition)
  fhir_bundle JSONB NOT NULL,

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

CREATE INDEX IF NOT EXISTS idx_wah_status ON wah_patients (status);
CREATE INDEX IF NOT EXISTS idx_wah_source ON wah_patients (source);
CREATE INDEX IF NOT EXISTS idx_wah_created ON wah_patients (created_at DESC);

-- ============================================
-- 2. Incoming Data Requests (WAH receiving requests from other orgs)
-- ============================================
CREATE TABLE wah_incoming_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  request_id UUID,                      -- Optional, ID from source system
  requesting_org VARCHAR(200) NOT NULL,
  requesting_org_id VARCHAR(100),
  destination_format VARCHAR(20) DEFAULT 'HL7V2',
  philhealth_no VARCHAR(30),
  patient_name VARCHAR(200),
  ipaas_transaction_id UUID,
  status VARCHAR(20) DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wah_inc_status ON wah_incoming_requests (status);

-- ============================================
-- 3. Outbound Data Requests (WAH requesting data from other orgs)
-- ============================================
CREATE TABLE wah_outbound_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  request_id UUID,                      -- ID sent to iPaaS
  target_org VARCHAR(200) NOT NULL,
  target_org_id VARCHAR(100),
  destination_format VARCHAR(20) DEFAULT 'FHIR_R4',
  philhealth_no VARCHAR(30),
  patient_name VARCHAR(200),
  request_reason TEXT,
  status VARCHAR(20) DEFAULT 'PENDING',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wah_out_status ON wah_outbound_requests (status);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS update_wah_patients_modtime ON wah_patients;
CREATE TRIGGER update_wah_patients_modtime
  BEFORE UPDATE ON wah_patients
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_wah_inc_modtime ON wah_incoming_requests;
CREATE TRIGGER update_wah_inc_modtime
  BEFORE UPDATE ON wah_incoming_requests
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_wah_out_modtime ON wah_outbound_requests;
CREATE TRIGGER update_wah_out_modtime
  BEFORE UPDATE ON wah_outbound_requests
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- RLS (open for prototype)
ALTER TABLE wah_patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for prototype" ON wah_patients FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE wah_incoming_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for prototype" ON wah_incoming_requests FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE wah_outbound_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for prototype" ON wah_outbound_requests FOR ALL USING (true) WITH CHECK (true);
