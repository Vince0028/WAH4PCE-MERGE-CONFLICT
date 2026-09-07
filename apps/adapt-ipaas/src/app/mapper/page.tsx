'use client';
import { Fragment, Suspense, useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

async function safeFetch(url: string) {
  const res = await fetch(url);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { success: false, data: [] }; }
}

// SHA-256 hash function (browser-compatible)
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Extract meaningful data from iHOMIS flat payloads ───
function extractHL7Data(payload: Record<string, unknown>): { category: string; label: string; value: string }[] {
  // Helper: check top-level first, then nested under `vitals`
  const vitalsObj = (payload.vitals && typeof payload.vitals === 'object') ? payload.vitals as Record<string, unknown> : null;
  const g = (k: string) => {
    if (payload[k] != null && String(payload[k]) !== '') return String(payload[k]);
    if (vitalsObj && vitalsObj[k] != null && String(vitalsObj[k]) !== '' && String(vitalsObj[k]) !== '0') return String(vitalsObj[k]);
    return '';
  };
  const rows: { category: string; label: string; value: string }[] = [];
  const add = (cat: string, label: string, val: string) => { if (val) rows.push({ category: cat, label, value: val }); };

  add('Patient', 'First Name', g('patient_fname'));
  add('Patient', 'Last Name', g('patient_lname'));
  add('Patient', 'Middle Name', g('patient_mname'));
  add('Patient', 'Suffix', g('patient_suffix'));
  add('Patient', 'Date of Birth', g('dob'));
  add('Patient', 'Sex', g('sex'));
  add('Patient', 'Civil Status', g('civil_status'));
  add('Patient', 'PhilHealth No.', g('philhealth_no'));
  add('Patient', 'Contact No.', g('contact_no'));
  add('Patient', 'Street', g('address_street'));
  add('Patient', 'Barangay', g('address_barangay'));
  add('Patient', 'City', g('address_city'));
  add('Patient', 'Province', g('address_province'));
  add('Patient', 'Zip Code', g('address_zip'));

  add('Vitals', 'BP Systolic', g('bp_systolic'));
  add('Vitals', 'BP Diastolic', g('bp_diastolic'));
  add('Vitals', 'Heart Rate', g('heart_rate'));
  add('Vitals', 'Temperature', g('temperature'));
  add('Vitals', 'Respiratory Rate', g('respiratory_rate'));
  add('Vitals', 'SpO2', g('oxygen_saturation'));
  add('Vitals', 'Weight (kg)', g('weight_kg'));
  add('Vitals', 'Height (cm)', g('height_cm'));

  add('Diagnosis', 'Chief Complaint', g('chief_complaint'));
  add('Diagnosis', 'ICD-10 Code', g('diagnosis_code'));
  add('Diagnosis', 'Description', g('diagnosis_desc'));
  add('Diagnosis', 'Type', g('diagnosis_type'));
  add('Diagnosis', 'Clinical Notes', g('clinical_notes'));

  add('Referral', 'Priority', g('priority'));
  add('Referral', 'Reason', g('referral_reason'));
  add('Referral', 'Physician', g('referring_physician'));
  add('Referral', 'Physician License', g('referring_physician_license'));
  add('Referral', 'Facility', g('referring_facility_name'));

  return rows;
}

// ─── Extract meaningful data from WAH FHIR bundles ───
function extractFHIRData(payload: Record<string, unknown>): { category: string; label: string; value: string }[] {
  const rows: { category: string; label: string; value: string }[] = [];
  const add = (cat: string, label: string, val: unknown) => { if (val != null && String(val)) rows.push({ category: cat, label, value: String(val) }); };

  // Navigate FHIR bundle
  const entries = (payload as any)?.entry || [];
  const resources = entries.map((e: any) => e?.resource).filter(Boolean);
  // Also handle top-level if payload is itself a resource list
  if (resources.length === 0 && (payload as any)?.resourceType) {
    resources.push(payload);
  }

  for (const res of resources) {
    const rt = res?.resourceType;
    if (rt === 'Patient') {
      const name = res.name?.[0] || {};
      add('Patient', 'Given Name', (name.given || []).join(' '));
      add('Patient', 'Family Name', name.family);
      add('Patient', 'Suffix', name.suffix?.[0]);
      add('Patient', 'Birth Date', res.birthDate);
      add('Patient', 'Gender', res.gender);
      add('Patient', 'Marital Status', res.maritalStatus?.text || res.maritalStatus?.coding?.[0]?.display);
      // PhilHealth
      for (const id of (res.identifier || [])) {
        if (id.system?.includes('philhealth') || id.type?.coding?.[0]?.code === 'SB') {
          add('Patient', 'PhilHealth No.', id.value);
        }
      }
      // Telecom
      for (const t of (res.telecom || [])) {
        add('Patient', 'Phone', t.value);
      }
      // Address
      const addr = res.address?.[0] || {};
      add('Patient', 'Address Line', (addr.line || []).join(', '));
      add('Patient', 'City', addr.city);
      add('Patient', 'Province/State', addr.state || addr.district);
      add('Patient', 'Postal Code', addr.postalCode);
    }
    if (rt === 'Encounter') {
      add('Encounter', 'Class', res.class?.display || res.class?.code);
      add('Encounter', 'Priority', res.priority?.coding?.[0]?.display || res.priority?.coding?.[0]?.code || res.priority?.text);
      add('Encounter', 'Reason', res.reasonCode?.[0]?.text || res.reasonCode?.[0]?.coding?.[0]?.display);
      add('Encounter', 'Facility', res.serviceProvider?.display);
      add('Encounter', 'Physician', res.participant?.[0]?.individual?.display);
    }
    if (rt === 'Observation') {
      const display = res.code?.text || res.code?.coding?.[0]?.display || 'Observation';
      if (res.component) {
        for (const comp of res.component) {
          const compName = comp.code?.coding?.[0]?.display || 'Component';
          add('Vitals', compName, comp.valueQuantity?.value);
        }
      } else if (res.valueQuantity) {
        add('Vitals', display, res.valueQuantity.value);
      }
    }
    if (rt === 'Condition') {
      add('Diagnosis', 'ICD-10 Code', res.code?.coding?.[0]?.code);
      add('Diagnosis', 'Description', res.code?.coding?.[0]?.display || res.code?.text);
      add('Diagnosis', 'Clinical Status', res.clinicalStatus?.coding?.[0]?.code);
      add('Diagnosis', 'Chief Complaint', res.note?.[0]?.text);
    }
    if (rt === 'ServiceRequest') {
      add('Referral', 'Reason', res.reasonCode?.[0]?.text);
      add('Referral', 'Priority', res.priority);
      add('Referral', 'Requester', res.requester?.display);
    }
  }
  return rows;
}

// ─── Parse HL7v2 pipe-delimited string into meaningful data ───
function parseHL7v2String(hl7: string): { category: string; label: string; value: string }[] {
  const rows: { category: string; label: string; value: string }[] = [];
  const add = (cat: string, label: string, val: string | undefined) => {
    if (val && val.trim()) rows.push({ category: cat, label, value: val.trim() });
  };

  const segments = hl7.split(/[\r\n]+/).filter(Boolean);
  for (const seg of segments) {
    const fields = seg.split('|');
    const segType = fields[0];

    if (segType === 'PID') {
      // PID|1||PhilHealth^^^PhilHealth^SB||LNAME^FNAME^MNAME^^^SUFFIX||DOB|SEX|||STREET^^CITY^PROVINCE^ZIP^PH|||CIVIL_STATUS|||||||||||||||CONTACT
      const phId = fields[3]?.split('^')[0];
      add('Patient', 'PhilHealth No.', phId);
      const nameParts = (fields[5] || '').split('^');
      add('Patient', 'Last Name', nameParts[0]);
      add('Patient', 'First Name', nameParts[1]);
      add('Patient', 'Middle Name', nameParts[2]);
      add('Patient', 'Suffix', nameParts[5]);
      add('Patient', 'Date of Birth', fields[7]);
      add('Patient', 'Sex', fields[8]);
      const addrParts = (fields[11] || '').split('^');
      add('Patient', 'Street', addrParts[0]);
      add('Patient', 'City', addrParts[2]);
      add('Patient', 'Province', addrParts[3]);
      add('Patient', 'Zip Code', addrParts[4]);
      add('Patient', 'Civil Status', fields[16]);
      // Contact is at end of PID
      const contact = fields[fields.length - 1];
      if (contact && /\d/.test(contact)) add('Patient', 'Contact No.', contact);
    }

    if (segType === 'PV1') {
      // PV1|1|O|FACILITY|||||||PHYSICIAN^LICENSE||...|||||||...|||...|||...|||...|||PRIORITY
      add('Referral', 'Physician', fields[9]?.split('^')[0]);
      add('Referral', 'Priority', fields[fields.length - 1]);
    }

    if (segType === 'OBX') {
      // OBX|seq|NM|LOINC^Display^LN||VALUE|UNIT|...
      const display = fields[3]?.split('^')[1] || 'Vital';
      const value = fields[5];
      const unit = fields[6];
      add('Vitals', display, value ? `${value}${unit ? ' ' + unit : ''}` : undefined);
    }

    if (segType === 'DG1') {
      // DG1|1||CODE^DESC^I10|||TYPE||||||||CHIEF_COMPLAINT
      const codeParts = (fields[3] || '').split('^');
      add('Diagnosis', 'ICD-10 Code', codeParts[0]);
      add('Diagnosis', 'Description', codeParts[1]);
      add('Diagnosis', 'Type', fields[6]);
      add('Diagnosis', 'Chief Complaint', fields[fields.length - 1]);
    }

    if (segType === 'RF1') {
      // RF1|PRIORITY|REASON||FACILITY|TIMESTAMP
      add('Referral', 'Reason', fields[2]);
      add('Referral', 'Facility', fields[4]);
    }
  }
  return rows;
}

// ─── Auto-detect and extract data from any payload ───
function extractDataFields(payload: Record<string, unknown>): { category: string; label: string; value: string }[] {
  // FHIR bundle
  if ((payload as any)?.resourceType === 'Bundle' || (payload as any)?.entry) {
    return extractFHIRData(payload);
  }
  // Single FHIR resource
  if ((payload as any)?.resourceType) {
    return extractFHIRData(payload);
  }
  // iHOMIS flat payload (has patient_fname or similar)
  if ((payload as any)?.patient_fname || (payload as any)?.patient_lname || (payload as any)?.philhealth_no || (payload as any)?.bp_systolic) {
    return extractHL7Data(payload);
  }
  // HL7v2 string inside { message: ... }
  if ((payload as any)?.message && typeof (payload as any).message === 'string') {
    return parseHL7v2String((payload as any).message);
  }
  // Raw HL7v2 string directly
  if (typeof payload === 'string' && (payload as string).startsWith('MSH|')) {
    return parseHL7v2String(payload as string);
  }
  // Fallback: try both
  const hl7 = extractHL7Data(payload);
  if (hl7.length > 0) return hl7;
  return extractFHIRData(payload);
}

// ─── Full field templates for each system (mirrors their actual forms) ───
// iHOMIS = 27 fields exactly
const IHOMIS_TEMPLATE: { category: string; label: string }[] = [
  { category: 'Patient Demographics', label: 'First Name' },
  { category: 'Patient Demographics', label: 'Middle Name' },
  { category: 'Patient Demographics', label: 'Last Name' },
  { category: 'Patient Demographics', label: 'Suffix' },
  { category: 'Patient Demographics', label: 'Date of Birth' },
  { category: 'Patient Demographics', label: 'Sex' },
  { category: 'Patient Demographics', label: 'Civil Status' },
  { category: 'Patient Demographics', label: 'PhilHealth No.' },
  { category: 'Patient Demographics', label: 'Contact No.' },
  { category: 'Patient Demographics', label: 'Street' },
  { category: 'Patient Demographics', label: 'Barangay' },
  { category: 'Patient Demographics', label: 'City' },
  { category: 'Patient Demographics', label: 'Province' },
  { category: 'Vital Signs', label: 'BP Systolic' },
  { category: 'Vital Signs', label: 'BP Diastolic' },
  { category: 'Vital Signs', label: 'Heart Rate' },
  { category: 'Vital Signs', label: 'Temperature' },
  { category: 'Vital Signs', label: 'Respiratory Rate' },
  { category: 'Vital Signs', label: 'SpO2' },
  { category: 'Vital Signs', label: 'Weight (kg)' },
  { category: 'Vital Signs', label: 'Height (cm)' },
  { category: 'Diagnosis & Referral', label: 'Chief Complaint' },
  { category: 'Diagnosis & Referral', label: 'ICD-10 Code' },
  { category: 'Diagnosis & Referral', label: 'Diagnosis Description' },
  { category: 'Diagnosis & Referral', label: 'Priority' },
  { category: 'Diagnosis & Referral', label: 'Referring Facility' },
  { category: 'Diagnosis & Referral', label: 'Physician' },
];

// WAH = 26 fields exactly
const WAH_TEMPLATE: { category: string; label: string }[] = [
  { category: 'Patient Resource', label: 'Given Name' },
  { category: 'Patient Resource', label: 'Middle Name' },
  { category: 'Patient Resource', label: 'Family Name' },
  { category: 'Patient Resource', label: 'Birth Date' },
  { category: 'Patient Resource', label: 'Gender' },
  { category: 'Patient Resource', label: 'PhilHealth ID' },
  { category: 'Patient Resource', label: 'Phone' },
  { category: 'Patient Resource', label: 'Address' },
  { category: 'Patient Resource', label: 'City' },
  { category: 'Encounter', label: 'Class' },
  { category: 'Encounter', label: 'Priority' },
  { category: 'Encounter', label: 'Facility' },
  { category: 'Encounter', label: 'Physician' },
  { category: 'Encounter', label: 'Reason' },
  { category: 'Observations (Vitals)', label: 'BP Systolic' },
  { category: 'Observations (Vitals)', label: 'BP Diastolic' },
  { category: 'Observations (Vitals)', label: 'Heart Rate' },
  { category: 'Observations (Vitals)', label: 'Temperature' },
  { category: 'Observations (Vitals)', label: 'Respiratory Rate' },
  { category: 'Observations (Vitals)', label: 'SpO2' },
  { category: 'Observations (Vitals)', label: 'Weight (kg)' },
  { category: 'Observations (Vitals)', label: 'Height (cm)' },
  { category: 'Condition', label: 'ICD-10 Code' },
  { category: 'Condition', label: 'Display' },
  { category: 'Condition', label: 'Chief Complaint' },
  { category: 'Condition', label: 'Clinical Status' },
];

// Map extracted labels → template labels (left = iHOMIS label, right = WAH label)
const FIELD_MAP: [string, string][] = [
  ['First Name', 'Given Name'],
  ['Last Name', 'Family Name'],
  ['Middle Name', 'Middle Name'],
  ['Date of Birth', 'Birth Date'],
  ['Sex', 'Gender'],
  ['PhilHealth No.', 'PhilHealth ID'],
  ['Contact No.', 'Phone'],
  ['Street', 'Address'],
  ['City', 'City'],
  ['BP Systolic', 'BP Systolic'],
  ['BP Diastolic', 'BP Diastolic'],
  ['Heart Rate', 'Heart Rate'],
  ['Temperature', 'Temperature'],
  ['Respiratory Rate', 'Respiratory Rate'],
  ['SpO2', 'SpO2'],
  ['Weight (kg)', 'Weight (kg)'],
  ['Height (cm)', 'Height (cm)'],
  ['Chief Complaint', 'Chief Complaint'],
  ['ICD-10 Code', 'ICD-10 Code'],
  ['Diagnosis Description', 'Display'],
  ['Priority', 'Priority'],
  ['Physician', 'Physician'],
  ['Referring Facility', 'Facility'],
];

// Also map from extractor-produced labels (which may differ from template labels)
const EXTRACTOR_ALIASES: Record<string, string[]> = {
  // WAH template labels ← extractFHIR labels
  'Given Name': ['Given Name'],
  'Family Name': ['Family Name'],
  'Birth Date': ['Birth Date'],
  'Gender': ['Gender'],
  'PhilHealth ID': ['PhilHealth No.', 'PhilHealth ID'],
  'Phone': ['Phone', 'Contact No.'],
  'Address': ['Address Line', 'Street', 'Address'],
  'Class': ['Class'],
  'Reason': ['Reason'],
  'Facility': ['Facility', 'Referring Facility'],
  'Physician': ['Physician', 'Requester'],
  'BP Systolic': ['BP Systolic', 'Systolic blood pressure', 'Systolic Blood Pressure'],
  'BP Diastolic': ['BP Diastolic', 'Diastolic blood pressure', 'Diastolic Blood Pressure'],
  'Heart Rate': ['Heart Rate', 'Heart rate'],
  'Temperature': ['Temperature', 'Body temperature', 'Body Temperature'],
  'Respiratory Rate': ['Respiratory Rate', 'Respiratory rate'],
  'SpO2': ['SpO2', 'Oxygen saturation', 'Oxygen Saturation'],
  'Weight (kg)': ['Weight (kg)', 'Body weight', 'Body Weight'],
  'Height (cm)': ['Height (cm)', 'Body height', 'Body Height'],
  'Display': ['Display', 'Description', 'Diagnosis Description'],
  'Clinical Status': ['Clinical Status', 'Clinical Notes'],
  'Chief Complaint': ['Chief Complaint'],
  'ICD-10 Code': ['ICD-10 Code'],
  'Middle Name': ['Middle Name'],
  'City': ['City'],
  'Priority': ['Priority'],
  // iHOMIS template labels ← extractFHIR labels
  'First Name': ['First Name', 'Given Name'],
  'Last Name': ['Last Name', 'Family Name'],
  'Date of Birth': ['Date of Birth', 'Birth Date'],
  'Sex': ['Sex', 'Gender'],
  'Civil Status': ['Civil Status', 'Marital Status'],
  'Contact No.': ['Contact No.', 'Phone'],
  'Street': ['Street', 'Address Line', 'Address'],
  'Province': ['Province', 'Province/State'],
  'Barangay': ['Barangay'],
  'Suffix': ['Suffix'],
  'Diagnosis Description': ['Diagnosis Description', 'Description', 'Display'],
  'Referring Facility': ['Referring Facility', 'Facility'],
  'Physician License': ['Physician License'],
};

function getDestTemplate(destSystem: string): { category: string; label: string }[] {
  if (destSystem.toLowerCase().includes('wah')) return WAH_TEMPLATE;
  return IHOMIS_TEMPLATE;
}

function findValueForTemplateField(
  templateLabel: string,
  extractedFields: { category: string; label: string; value: string }[],
  isDestWAH: boolean
): string | null {
  // Direct match
  const direct = extractedFields.find(f => f.label === templateLabel);
  if (direct) return direct.value;

  // Check via extractor aliases
  const aliases = EXTRACTOR_ALIASES[templateLabel];
  if (aliases) {
    for (const alias of aliases) {
      const found = extractedFields.find(f => f.label === alias);
      if (found) return found.value;
    }
  }

  // Case-insensitive fallback
  const lower = templateLabel.toLowerCase();
  const ci = extractedFields.find(f => f.label.toLowerCase() === lower);
  if (ci) return ci.value;

  // Check via FIELD_MAP
  for (const [iLabel, wLabel] of FIELD_MAP) {
    const destLabel = isDestWAH ? wLabel : iLabel;
    const srcLabel = isDestWAH ? iLabel : wLabel;
    if (destLabel === templateLabel) {
      const found = extractedFields.find(f => f.label === srcLabel);
      if (found) return found.value;
    }
  }
  return null;
}

function ComparisonTable({ raw, transformed, source, dest }: { raw: Record<string, unknown> | null, transformed: Record<string, unknown> | null, source: string, dest: string }) {
  const srcFields = useMemo(() => raw ? extractDataFields(raw) : [], [raw]);
  const destExtracted = useMemo(() => transformed ? extractDataFields(transformed) : [], [transformed]);
  const destTemplate = useMemo(() => getDestTemplate(dest), [dest]);
  const isDestWAH = dest.toLowerCase().includes('wah');

  // Build right-side rows: ALL template fields, filled or empty
  const destRows = useMemo(() => {
    return destTemplate.map(tf => {
      // First try to find in the actual extracted transformed data
      const fromTransformed = findValueForTemplateField(tf.label, destExtracted, isDestWAH);
      if (fromTransformed) return { ...tf, value: fromTransformed, status: 'Filled' as const };

      // Not found
      return { ...tf, value: '', status: 'Empty' as const };
    });
  }, [destTemplate, destExtracted, isDestWAH]);

  const filledCount = destRows.filter(r => r.status === 'Filled').length;
  const emptyCount = destRows.filter(r => r.status === 'Empty').length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* ─── LEFT: Source system's data ─── */}
      <div className="ipaas-card overflow-hidden">
        <div className="px-4 py-3 border-b border-[#e5e7eb] bg-[#fafafa]">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--color-warning)' }} />
            <h3 className="text-xs font-semibold uppercase tracking-wide">{source} — Data Sent</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 ml-auto">{srcFields.length} fields</span>
          </div>
        </div>
        <div className="overflow-auto max-h-[600px]">
          <table className="w-full text-left text-xs" style={{ borderCollapse: 'collapse' }}>
            <thead className="bg-[#f9fafb] sticky top-0" style={{ zIndex: 1 }}>
              <tr>
                <th className="p-3 font-semibold text-gray-600 border-b border-[#e5e7eb]">Field</th>
                <th className="p-3 font-semibold text-gray-600 border-b border-[#e5e7eb]">Value</th>
              </tr>
            </thead>
            <tbody>
              {(() => { let lastCat = ''; return srcFields.map((row, i) => {
                const showCat = row.category !== lastCat;
                lastCat = row.category;
                return (
                  <Fragment key={`src-${i}`}>{showCat && (
                    <tr className="border-t-2 border-t-gray-200">
                      <td colSpan={2} className="px-3 pt-3 pb-1 font-semibold text-gray-700 text-[11px] uppercase tracking-wide">{row.category}</td>
                    </tr>
                  )}
                  <tr className="hover:bg-gray-50 border-b border-[#e5e7eb] last:border-0 transition-colors">
                    <td className="px-3 py-2" style={{ color: 'var(--color-text-muted)' }}>{row.label}</td>
                    <td className="px-3 py-2 font-mono font-medium">{row.value}</td>
                  </tr></Fragment>
                );
              }); })()}
              {srcFields.length === 0 && (
                <tr><td colSpan={2} className="p-8 text-center text-gray-500">No data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── RIGHT: Destination system's ALL fields ─── */}
      <div className="ipaas-card overflow-hidden">
        <div className="px-4 py-3 border-b border-[#e5e7eb] bg-[#fafafa]">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--color-success)' }} />
            <h3 className="text-xs font-semibold uppercase tracking-wide">{dest} — Data Received</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 ml-auto">
              {filledCount} filled · {emptyCount} empty
            </span>
          </div>
        </div>
        <div className="overflow-auto max-h-[600px]">
          <table className="w-full text-left text-xs" style={{ borderCollapse: 'collapse' }}>
            <thead className="bg-[#f9fafb] sticky top-0" style={{ zIndex: 1 }}>
              <tr>
                <th className="p-3 font-semibold text-gray-600 border-b border-[#e5e7eb]">Field</th>
                <th className="p-3 font-semibold text-gray-600 border-b border-[#e5e7eb]">Value</th>
                <th className="p-3 font-semibold text-gray-600 border-b border-[#e5e7eb] text-center w-[80px]">Status</th>
              </tr>
            </thead>
            <tbody>
              {(() => { let lastCat = ''; return destRows.map((row, i) => {
                const showCat = row.category !== lastCat;
                lastCat = row.category;
                const isFilled = row.status === 'Filled';
                return (
                  <Fragment key={`dest-${i}`}>{showCat && (
                    <tr className="border-t-2 border-t-gray-200">
                      <td colSpan={3} className="px-3 pt-3 pb-1 font-semibold text-gray-700 text-[11px] uppercase tracking-wide">{row.category}</td>
                    </tr>
                  )}
                  <tr className={`hover:bg-gray-50 border-b border-[#e5e7eb] last:border-0 transition-colors ${!isFilled ? 'bg-red-50/30' : ''}`}>
                    <td className="px-3 py-2" style={{ color: isFilled ? 'var(--color-text-muted)' : '#d1d5db' }}>{row.label}</td>
                    <td className="px-3 py-2 font-mono font-medium" style={{ color: isFilled ? undefined : '#d1d5db' }}>{isFilled ? row.value : '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isFilled ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#fee2e2] text-[#991b1b]'}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr></Fragment>
                );
              }); })()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Synchronous hash for initial display
function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const chr = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `${hex}${hex}${hex}${hex}${hex}${hex}${hex}${hex}`.slice(0, 64);
}

interface Transaction {
  id: string; source_system: string; destination_system: string;
  status: string; raw_payload: Record<string, unknown>;
  transformed_payload: Record<string, unknown> | null;
  error_message: string | null; created_at: string;
}

// Hashable payload panel component
function HashablePayload({ label, dotColor, payload }: { label: string; dotColor: string; payload: Record<string, unknown> | null }) {
  const [revealed, setRevealed] = useState(false);
  const [hash, setHash] = useState<string>('');

  const jsonStr = payload ? JSON.stringify(payload, null, 2) : '';

  useEffect(() => {
    if (jsonStr) {
      setHash(simpleHash(jsonStr));
      sha256(jsonStr).then(setHash);
    }
  }, [jsonStr]);

  if (!payload) {
    return (
      <div className="ipaas-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: dotColor }} />
          <h3 className="text-xs font-semibold uppercase tracking-wide">{label}</h3>
        </div>
        <div className="p-8 text-center rounded" style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)' }}>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Transformation pending or failed</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ipaas-card p-4" style={revealed ? { borderColor: 'rgba(139,92,246,0.3)' } : {}}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: dotColor }} />
          <h3 className="text-xs font-semibold uppercase tracking-wide">{label}</h3>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{
            background: revealed ? 'rgba(139,92,246,0.08)' : 'rgba(245,158,11,0.08)',
            color: revealed ? '#8b5cf6' : '#f59e0b',
          }}>
            {revealed ? 'REVEALED' : 'SHA-256 HASHED'}
          </span>
        </div>
        <button
          onClick={() => setRevealed(!revealed)}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-all"
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
      <pre
        className="p-3 rounded text-xs overflow-auto"
        style={{
          background: 'var(--color-bg-primary)',
          border: '1px solid var(--color-border)',
          maxHeight: '600px',
          fontFamily: "'JetBrains Mono', monospace",
          color: revealed ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
          wordBreak: revealed ? 'break-word' : 'break-all',
          whiteSpace: revealed ? 'pre-wrap' : 'nowrap',
        }}
      >
        {revealed ? jsonStr : hash}
      </pre>
    </div>
  );
}

export default function MapperPage() {
  return (
    <Suspense fallback={
      <><Sidebar /><main className="flex-1 p-6 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-accent-bright)' }} />
      </main></>
    }>
      <MapperContent />
    </Suspense>
  );
}

function MapperContent() {
  const searchParams = useSearchParams();
  const txId = searchParams.get('id');
  const [tx, setTx] = useState<Transaction | null>(null);
  const [allTx, setAllTx] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'json' | 'table'>('json');

  useEffect(() => {
    async function fetchData() {
      const data = await safeFetch('/api/transactions?limit=50');
      if (data.success) {
        setAllTx(data.data || []);
        if (txId) {
          const found = data.data?.find((t: Transaction) => t.id === txId);
          if (found) setTx(found);
        } else if (data.data?.length > 0) {
          setTx(data.data[0]);
        }
      }
      setLoading(false);
    }
    fetchData();
  }, [txId]);

  const statusStyle = (s: string) => {
    const m: Record<string, { bg: string; color: string }> = {
      SUCCESS: { bg: 'rgba(5,150,105,0.08)', color: '#059669' },
      PENDING: { bg: 'rgba(217,119,6,0.08)', color: '#d97706' },
      TRANSFORMING: { bg: 'rgba(37,99,235,0.08)', color: '#2563eb' },
      QUARANTINED: { bg: 'rgba(220,38,38,0.08)', color: '#dc2626' },
    };
    return m[s] || m.PENDING;
  };

  const rawLabel = (src: string) => src === 'iHOMIS' ? 'HL7 v2 Payload' : 'FHIR R4 Bundle';
  const transformedLabel = (dest: string) => dest === 'WAH' ? 'PH Core FHIR R4' : 'iHOMIS Format';

  return (
    <>
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="mb-5">
          <h1 className="text-lg font-semibold">Data Mapper</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Side-by-side view of raw input and AI-transformed output. All payloads are SHA-256 hashed by default.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-accent-bright)' }} />
          </div>
        ) : !tx ? (
          <div className="ipaas-card p-10 text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1" className="mx-auto mb-3"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No transactions to display. Send data from iHOMIS or WAH first.</p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <select value={tx.id} onChange={e => { const found = allTx.find(t => t.id === e.target.value); if (found) setTx(found); }}
                className="px-3 py-2 rounded-md text-xs outline-none w-full max-w-md" style={{ background: '#fff', border: '1px solid var(--color-border)' }}>
                {allTx.map(t => <option key={t.id} value={t.id}>{t.id.slice(0, 8)} — {t.source_system} → {t.destination_system} ({t.status})</option>)}
              </select>

              <div className="flex bg-[#f3f4f6] rounded-md p-1" style={{ border: '1px solid var(--color-border)' }}>
                <button
                  onClick={() => setViewMode('json')}
                  className={`px-4 py-1.5 text-xs font-medium rounded transition-colors ${viewMode === 'json' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-900'}`}
                >
                  JSON
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-4 py-1.5 text-xs font-medium rounded transition-colors ${viewMode === 'table' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-900'}`}
                >
                  Comparison Table
                </button>
              </div>
            </div>

            <div className="ipaas-card p-4 mb-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold px-2 py-1 rounded" style={{
                    background: tx.source_system === 'iHOMIS' ? 'rgba(37,99,235,0.08)' : 'rgba(5,150,105,0.08)',
                    color: tx.source_system === 'iHOMIS' ? '#2563eb' : '#059669',
                  }}>{tx.source_system}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  <span className="text-xs font-semibold px-2 py-1 rounded" style={{
                    background: tx.destination_system === 'iHOMIS' ? 'rgba(37,99,235,0.08)' : 'rgba(5,150,105,0.08)',
                    color: tx.destination_system === 'iHOMIS' ? '#2563eb' : '#059669',
                  }}>{tx.destination_system}</span>
                  <span className="ipaas-badge" style={{ ...statusStyle(tx.status) }}>{tx.status}</span>
                </div>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{new Date(tx.created_at).toLocaleString()}</p>
              </div>
              {tx.error_message && (
                <div className="mt-3 p-2.5 rounded text-xs flex items-center gap-2" style={{ background: 'rgba(220,38,38,0.05)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.15)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  {tx.error_message}
                </div>
              )}
            </div>

            {viewMode === 'json' ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <HashablePayload
                  label={`Raw — ${rawLabel(tx.source_system)}`}
                  dotColor="var(--color-warning)"
                  payload={tx.raw_payload}
                />
                <HashablePayload
                  label={`Transformed — ${transformedLabel(tx.destination_system)}`}
                  dotColor="var(--color-success)"
                  payload={tx.transformed_payload}
                />
              </div>
            ) : (
              <ComparisonTable raw={tx.raw_payload} transformed={tx.transformed_payload} source={tx.source_system} dest={tx.destination_system} />
            )}
          </>
        )}
      </main>
    </>
  );
}
