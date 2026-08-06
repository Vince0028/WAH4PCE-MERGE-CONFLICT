'use client';
import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';

// SHA-256 hash function (browser-compatible)
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Synchronous simple hash for initial display (before async SHA-256 resolves)
function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const chr = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  // Repeat to make it look like a proper hash
  return `${hex}${hex}${hex}${hex}${hex}${hex}${hex}${hex}`.slice(0, 64);
}

interface ConfigItem {
  id: string;
  label: string;
  category: string;
  value: string;
  description: string;
  type: 'short' | 'long' | 'code';
}

const AI_CONFIG: ConfigItem[] = [
  // --- AI Model Configuration ---
  {
    id: 'api_key',
    label: 'Gemini API Key',
    category: 'AI Model',
    value: 'AIzaSyBAUR1X4Se7rZSQBE7yVtorRkduyY1vIEM',
    description: 'Google Gemini API key used for AI-powered health data transformation',
    type: 'short',
  },
  {
    id: 'api_key_groq',
    label: 'Groq API Key',
    category: 'AI Model',
    value: 'gsk_...',
    description: 'Groq API key for LPU-accelerated fallback transformation (LLama 3.3)',
    type: 'short',
  },
  {
    id: 'primary_model',
    label: 'Primary Model',
    category: 'AI Model',
    value: 'gemini-3.1-flash-lite',
    description: 'Primary Gemini model used for transformation (configured via GEMINI_MODEL env)',
    type: 'short',
  },
  {
    id: 'fallback_models',
    label: 'Model Fallback Chain',
    category: 'AI Model',
    value: JSON.stringify([
      { provider: 'gemini', model: 'gemini-3.1-flash-lite' },
      { provider: 'gemini', model: 'gemini-2.5-flash-lite' },
      { provider: 'gemini', model: 'gemini-2.5-flash' },
      { provider: 'groq', model: 'llama-3.3-70b-versatile' },
      { provider: 'groq', model: 'mixtral-8x7b-32768' },
      { provider: 'groq', model: 'llama3-70b-8192' }
    ], null, 2),
    description: 'Ordered fallback chain — if Gemini hits quota (429), the engine juggles to Groq automatically',
    type: 'code',
  },
  {
    id: 'gen_config',
    label: 'Generation Config',
    category: 'AI Model',
    value: JSON.stringify({
      responseMimeType: 'application/json',
      temperature: 0.1,
    }, null, 2),
    description: 'Model generation parameters — low temperature (0.1) ensures deterministic, consistent output',
    type: 'code',
  },

  // --- Supported Formats (3 formats) ---
  {
    id: 'format_hl7v2',
    label: 'Format 1 — HL7 v2.x',
    category: 'Data Formats',
    value: 'HL7 v2.x (pipe-delimited segments: MSH, PID, PV1, OBX, DG1, RF1)',
    description: 'Organizations using HL7 v2.x send data in ADT^A01 message format (e.g., DOH iHOMIS hospitals)',
    type: 'short',
  },
  {
    id: 'format_fhir',
    label: 'Format 2 — PH Core FHIR R4',
    category: 'Data Formats',
    value: 'PH Core HL7 FHIR R4 Transaction Bundle (Patient, Encounter, Observation, Condition)',
    description: 'WAH hospital and FHIR-native organizations use FHIR R4 JSON Bundles per Philippine standards',
    type: 'short',
  },
  {
    id: 'format_cda_r2',
    label: 'Format 3 — CDA R2',
    category: 'Data Formats',
    value: 'Clinical Document Architecture Release 2 (XML-based clinical document with structured body)',
    description: 'Organizations using CDA R2 send XML clinical documents with sections for vitals, diagnosis, and encounters',
    type: 'short',
  },
  {
    id: 'format_cda_r2_structure',
    label: 'CDA R2 Output Structure',
    category: 'Data Formats',
    value: JSON.stringify({
      documentType: 'CDA_R2',
      typeId: { root: '2.16.840.1.113883.1.3', extension: 'POCD_HD000040' },
      recordTarget: { patientRole: { id: 'PhilHealth ID', patient: { name: '...', gender: '...', birthTime: '...' } } },
      component: { structuredBody: { vitalSigns: '...', diagnosis: '...', encounter: '...' } },
    }, null, 2),
    description: 'JSON representation of CDA R2 document structure used as AI transformation output',
    type: 'code',
  },
  {
    id: 'coding_systems',
    label: 'Coding Systems',
    category: 'Data Formats',
    value: JSON.stringify({
      'Patient ID': 'PhilHealth Member ID (https://www.philhealth.gov.ph/memberid)',
      'Diagnosis': 'ICD-10 (International Classification of Diseases, 10th Revision)',
      'Vital Signs': 'LOINC (Logical Observation Identifiers Names and Codes)',
      'FHIR Profile': 'PH Core (http://fhir.ph/StructureDefinition/ph-core-patient)',
      'CDA Document': 'HL7 CDA R2 (urn:hl7-org:v3)',
    }, null, 2),
    description: 'Standard medical coding systems used across all 3 formats',
    type: 'code',
  },

  // --- System Prompts ---
  {
    id: 'prompt_hl7_to_fhir',
    label: 'HL7 v2 → FHIR R4 Prompt',
    category: 'System Prompts',
    value: `You are a healthcare data transformation engine for the Philippine Local Health Information Exchange (LHIE).

Your task: Convert the following HL7 v2.x message (pipe-delimited segments: MSH, PID, PV1, OBX, DG1, RF1) into a FULLY VALID PH Core HL7 FHIR R4 Transaction Bundle.

HL7 v2 segment reference:
- MSH: Message Header (sending facility, timestamp)
- PID: Patient ID, name (format: LASTNAME^FIRSTNAME^MIDDLENAME), DOB, sex, address, PhilHealth number
- PV1: Patient Visit (class, attending physician, priority)
- OBX: Observation (vital signs with LOINC codes)
- DG1: Diagnosis (ICD-10 code, description)
- RF1: Referral info (priority, reason, facility)

The output FHIR Bundle MUST contain:
1. **Patient** — PH Core Patient profile with PhilHealth identifier (system: "https://www.philhealth.gov.ph/memberid"), meta profile: "http://fhir.ph/StructureDefinition/ph-core-patient"
2. **Encounter** — with status, class, priority, participant, serviceProvider
3. **Observation** resources for each OBX segment (vital signs with LOINC codes, units of measure)
4. **Condition** — from DG1 segment with ICD-10 coding

Bundle: type "transaction", fullUrl using "urn:uuid:" format, request with method "POST".
Output ONLY valid JSON. No markdown, no code fences, no explanation.`,
    description: 'System prompt used when transforming iHOMIS HL7 v2 messages into WAH FHIR R4 Bundles',
    type: 'long',
  },
  {
    id: 'prompt_fhir_to_hl7',
    label: 'FHIR R4 → iHOMIS JSON Prompt',
    category: 'System Prompts',
    value: `You are a healthcare data transformation engine for the Philippine Local Health Information Exchange (LHIE).

Your task: Convert the following PH Core HL7 FHIR R4 Bundle into iHOMIS-compatible flat JSON format that can be stored in the iHOMIS database.

Extract data from the FHIR Bundle resources (Patient, Encounter, Observation, Condition) and map them to this EXACT structure:

{
  "patient_fname": "from Patient.name[0].given[0]",
  "patient_lname": "from Patient.name[0].family",
  "patient_mname": "from Patient.name[0].given[1] or empty string",
  "patient_suffix": "from Patient.name[0].suffix[0] or empty string",
  "dob": "Patient.birthDate in YYYY-MM-DD",
  "sex": "M or F from Patient.gender (male=M, female=F)",
  "civil_status": "S/M/W/D from Patient.maritalStatus",
  "philhealth_no": "from Patient.identifier where system contains philhealth",
  "contact_no": "from Patient.telecom where system is phone",
  "address_street": "from Patient.address[0].line[0]",
  "address_barangay": "from Patient.address[0].line[1] or empty",
  "address_city": "from Patient.address[0].city",
  "address_province": "from Patient.address[0].district",
  "address_zip": "from Patient.address[0].postalCode",
  "vitals": {
    "bp_systolic": "number from BP component LOINC 8480-6",
    "bp_diastolic": "number from BP component LOINC 8462-4",
    "heart_rate": "number from LOINC 8867-4",
    "temperature": "number from LOINC 8310-5",
    "respiratory_rate": "number from LOINC 9279-1",
    "oxygen_saturation": "number from LOINC 2708-6 or null",
    "weight_kg": "number from LOINC 29463-7",
    "height_cm": "number from LOINC 8302-2"
  },
  "chief_complaint": "from Condition.note or Encounter.reasonCode",
  "diagnosis_code": "ICD-10 code from Condition.code.coding",
  "diagnosis_desc": "display from Condition.code",
  "diagnosis_type": "admitting/final/working from Condition.verificationStatus",
  "referring_facility_code": "from Encounter.serviceProvider or generate",
  "referring_facility_name": "from Encounter.serviceProvider display",
  "referring_physician": "from Encounter.participant display",
  "referring_physician_license": "from identifier or empty",
  "referral_reason": "from Encounter.reasonCode text",
  "priority": "ROUTINE/URGENT/EMERGENCY from Encounter.priority"
}

All numeric vitals must be numbers, not strings. Missing fields should use empty string or 0.
Output ONLY valid JSON. No markdown, no code fences, no explanation.`,
    description: 'System prompt used when transforming WAH FHIR R4 Bundles into iHOMIS flat JSON format',
    type: 'long',
  },

  // --- Validation Rules ---
  {
    id: 'fhir_validation',
    label: 'FHIR R4 Validation Rules',
    category: 'Validation',
    value: JSON.stringify({
      required_resource_types: ['Patient', 'Encounter', 'Condition'],
      patient_must_have: 'PhilHealth identifier (system: philhealth.gov.ph)',
      bundle_type: 'transaction',
      fullUrl_format: 'urn:uuid:*',
    }, null, 2),
    description: 'Validation rules applied to FHIR R4 output before forwarding to WAH',
    type: 'code',
  },
  {
    id: 'ihomis_validation',
    label: 'iHOMIS Validation Rules',
    category: 'Validation',
    value: JSON.stringify({
      required_fields: ['patient_fname', 'patient_lname', 'dob', 'sex', 'philhealth_no', 'diagnosis_code', 'referring_facility_name'],
      required_vitals: ['bp_systolic', 'bp_diastolic', 'heart_rate', 'temperature'],
      philhealth_min_length: 6,
    }, null, 2),
    description: 'Validation rules applied to iHOMIS JSON output before forwarding to DOH',
    type: 'code',
  },

  // --- Infrastructure ---
  {
    id: 'supabase_url',
    label: 'Supabase URL',
    category: 'Infrastructure',
    value: 'https://eylgfdfnyuygqsccsshm.supabase.co',
    description: 'ADAPT iPaaS Supabase project for transaction logging and data storage',
    type: 'short',
  },
  {
    id: 'supabase_key',
    label: 'Supabase Anon Key',
    category: 'Infrastructure',
    value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5bGdmZGZueXV5Z3FzY2Nzc2htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NDkwNTMsImV4cCI6MjA5NDQyNTA1M30.n0MmQ12fljSNsl5hK1xeLF3YkIOTwKXfVYdSmO8tuRE',
    description: 'Supabase anonymous key for client-side data access (RLS-protected)',
    type: 'short',
  },
  {
    id: 'ihomis_webhook',
    label: 'iHOMIS Webhook URL',
    category: 'Infrastructure',
    value: 'http://localhost:3001/api/webhook',
    description: 'Endpoint where transformed FHIR→iHOMIS data is forwarded',
    type: 'short',
  },
  {
    id: 'wah_webhook',
    label: 'WAH Webhook URL',
    category: 'Infrastructure',
    value: 'http://localhost:3002/api/webhook',
    description: 'Endpoint where transformed HL7v2→FHIR data is forwarded',
    type: 'short',
  },
];

const CATEGORIES = ['AI Model', 'Data Formats', 'System Prompts', 'Validation', 'Infrastructure'];

function HashableValue({ item, forceReveal }: { item: ConfigItem; forceReveal: boolean }) {
  const [localRevealed, setLocalRevealed] = useState(false);
  const [hash, setHash] = useState<string>(simpleHash(item.value));

  // Compute real SHA-256 on mount
  useEffect(() => {
    sha256(item.value).then(setHash);
  }, [item.value]);

  const revealed = forceReveal || localRevealed;
  const displayValue = revealed ? item.value : hash;

  return (
    <div className="ipaas-card p-4 transition-all" style={revealed ? { borderColor: 'rgba(139,92,246,0.3)' } : {}}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold">{item.label}</span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{
              background: revealed ? 'rgba(139,92,246,0.08)' : 'rgba(245,158,11,0.08)',
              color: revealed ? '#8b5cf6' : '#f59e0b',
            }}>
              {revealed ? 'REVEALED' : 'SHA-256 HASHED'}
            </span>
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>{item.description}</p>
        </div>
        <button
          onClick={() => setLocalRevealed(!localRevealed)}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-all flex-shrink-0 ml-3"
          style={{
            background: revealed ? 'rgba(220,38,38,0.06)' : 'rgba(139,92,246,0.06)',
            color: revealed ? '#dc2626' : '#8b5cf6',
            border: `1px solid ${revealed ? 'rgba(220,38,38,0.15)' : 'rgba(139,92,246,0.15)'}`,
          }}
        >
          {revealed ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
              Re-hash
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Unhash
            </>
          )}
        </button>
      </div>

      {item.type === 'long' || item.type === 'code' ? (
        <pre
          className="p-3 rounded-md text-xs overflow-auto"
          style={{
            background: 'var(--color-bg-primary)',
            border: '1px solid var(--color-border)',
            maxHeight: revealed ? '500px' : '80px',
            fontFamily: revealed ? "'JetBrains Mono', 'Fira Code', monospace" : 'monospace',
            color: revealed ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            wordBreak: revealed ? 'break-word' : 'break-all',
            whiteSpace: revealed ? 'pre-wrap' : 'nowrap',
            transition: 'max-height 0.3s ease',
          }}
        >
          {displayValue}
        </pre>
      ) : (
        <div
          className="px-3 py-2 rounded-md text-xs overflow-hidden"
          style={{
            background: 'var(--color-bg-primary)',
            border: '1px solid var(--color-border)',
            fontFamily: revealed ? "'Inter', sans-serif" : 'monospace',
            color: revealed ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            wordBreak: revealed ? 'break-word' : 'break-all',
            whiteSpace: revealed ? 'normal' : 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          {displayValue}
        </div>
      )}
    </div>
  );
}

export default function AIConfigPage() {
  const [revealAll, setRevealAll] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('AI Model');

  const filteredItems = AI_CONFIG.filter(item => item.category === activeCategory);

  return (
    <>
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">AI Configuration</h1>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Model, prompts, formats & infrastructure. All values are SHA-256 hashed by default.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md" style={{ background: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.15)', color: '#059669' }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#059669' }} />
              Gemini & Groq Active
            </div>
            <button
              onClick={() => setRevealAll(!revealAll)}
              className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-md transition-all"
              style={{
                background: revealAll ? 'rgba(220,38,38,0.06)' : 'rgba(139,92,246,0.06)',
                color: revealAll ? '#dc2626' : '#8b5cf6',
                border: `1px solid ${revealAll ? 'rgba(220,38,38,0.15)' : 'rgba(139,92,246,0.15)'}`,
              }}
            >
              {revealAll ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                  Re-hash All
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 019.9-1" />
                  </svg>
                  Unhash All
                </>
              )}
            </button>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-1 mb-5 overflow-x-auto pb-1">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className="text-xs px-4 py-2 rounded-md font-medium transition-all whitespace-nowrap"
              style={{
                background: activeCategory === cat ? 'var(--color-accent-bright)' : 'var(--color-bg-secondary)',
                color: activeCategory === cat ? '#fff' : 'var(--color-text-secondary)',
                border: `1px solid ${activeCategory === cat ? 'var(--color-accent-bright)' : 'var(--color-border)'}`,
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Config Items */}
        <div className="space-y-3" style={{ maxHeight: 'calc(100vh - 220px)', overflowY: 'auto', paddingRight: '4px' }}>
          {filteredItems.map(item => (
            <HashableValue key={item.id} item={item} forceReveal={revealAll} />
          ))}
        </div>
      </main>
    </>
  );
}

