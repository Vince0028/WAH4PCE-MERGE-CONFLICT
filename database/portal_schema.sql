-- ============================================
-- Organization Portal Database Schema (Supabase #1)
-- Run this in the Portal Supabase SQL Editor
-- (Replaces the old ihomis_schema.sql)
-- ============================================
-- Multi-organization portal for health data exchange.
-- Organizations register with Supabase Auth, set their data format,
-- and exchange patient data with WAH via ADAPT iPaaS.
-- Safe to re-run (uses DROP IF EXISTS).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. Organizations Table
-- ============================================
-- Stores organization profiles linked to Supabase Auth users.
-- Each org has a data format preference (HL7v2, FHIR R4, or CDA R2).

DROP TABLE IF EXISTS data_requests CASCADE;
DROP TABLE IF EXISTS org_patients CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;
DROP TABLE IF EXISTS ihomis_patients CASCADE;  -- Remove legacy iHOMIS table

CREATE TABLE organizations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  auth_user_id UUID NOT NULL UNIQUE,  -- Links to Supabase Auth user
  name VARCHAR(200) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,   -- Short org code (e.g., 'IHOMIS-001')
  data_format VARCHAR(20) NOT NULL DEFAULT 'HL7V2'
    CHECK (data_format IN ('HL7V2', 'FHIR_R4', 'CDA_R2')),
  contact_email VARCHAR(200),
  webhook_url VARCHAR(500),           -- Optional webhook for receiving data
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_auth_user ON organizations (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_org_code ON organizations (code);
CREATE INDEX IF NOT EXISTS idx_org_format ON organizations (data_format);

-- ============================================
-- 2. Organization Patients Table
-- ============================================
-- Stores patient records for each organization.
-- data_payload stores the patient data in whatever format the org uses.

CREATE TABLE org_patients (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Extracted metadata (for search/display, format-agnostic)
  patient_name VARCHAR(200),
  philhealth_no VARCHAR(30),
  sex VARCHAR(10),
  dob DATE,
  diagnosis_code VARCHAR(20),
  diagnosis_desc TEXT,
  priority VARCHAR(20) DEFAULT 'ROUTINE',

  -- Full patient data as JSON (format depends on org's data_format)
  data_payload JSONB NOT NULL,

  -- Raw source payload (original data before transformation, for comparison)
  raw_source_payload JSONB,

  -- Patient data privacy consent (RA 10173)
  consent_signed BOOLEAN DEFAULT FALSE,

  -- Record tracking
  status VARCHAR(20) DEFAULT 'SAVED'
    CHECK (status IN ('SAVED', 'QUEUED', 'SENT', 'RECEIVED', 'REJECTED')),
  source VARCHAR(20) DEFAULT 'LOCAL'
    CHECK (source IN ('LOCAL', 'RECEIVED')),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orgpat_org ON org_patients (org_id);
CREATE INDEX IF NOT EXISTS idx_orgpat_status ON org_patients (status);
CREATE INDEX IF NOT EXISTS idx_orgpat_source ON org_patients (source);
CREATE INDEX IF NOT EXISTS idx_orgpat_philhealth ON org_patients (philhealth_no);
CREATE INDEX IF NOT EXISTS idx_orgpat_created ON org_patients (created_at DESC);

-- ============================================
-- 3. Data Requests Table
-- ============================================
-- Tracks data transfer requests between organizations and WAH.
-- e.g., "St. Luke's requests patient X's data from WAH"

CREATE TABLE data_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  requesting_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  target_system VARCHAR(50) NOT NULL DEFAULT 'WAH',  -- Which system to request from
  philhealth_no VARCHAR(30),          -- Search by PhilHealth number
  patient_name VARCHAR(200),          -- Or search by name
  request_reason TEXT,                -- Why the org needs the data

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'DENIED', 'FAILED')),

  -- Response data (filled when request is completed)
  response_payload JSONB,             -- The converted patient data
  transaction_id UUID,                -- iPaaS transaction reference
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_datareq_org ON data_requests (requesting_org_id);
CREATE INDEX IF NOT EXISTS idx_datareq_status ON data_requests (status);
CREATE INDEX IF NOT EXISTS idx_datareq_philhealth ON data_requests (philhealth_no);
CREATE INDEX IF NOT EXISTS idx_datareq_created ON data_requests (created_at DESC);

-- ============================================
-- Auto-update triggers
-- ============================================
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS update_organizations_modtime ON organizations;
CREATE TRIGGER update_organizations_modtime
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_org_patients_modtime ON org_patients;
CREATE TRIGGER update_org_patients_modtime
  BEFORE UPDATE ON org_patients
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_data_requests_modtime ON data_requests;
CREATE TRIGGER update_data_requests_modtime
  BEFORE UPDATE ON data_requests
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- ============================================
-- RLS (open for prototype)
-- ============================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for prototype" ON organizations FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE org_patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for prototype" ON org_patients FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE data_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for prototype" ON data_requests FOR ALL USING (true) WITH CHECK (true);
