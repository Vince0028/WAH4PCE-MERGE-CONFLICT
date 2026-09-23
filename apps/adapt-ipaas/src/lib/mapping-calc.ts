/**
 * Shared mapping completeness calculator.
 * Reused by both the Data Mapper page and the Dashboard to compute
 * how many destination fields were successfully filled by the AI transformation.
 */

// ─── Templates ───

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

// ─── Aliases (same as mapper) ───

const EXTRACTOR_ALIASES: Record<string, string[]> = {
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
  'PhilHealth No.': ['PhilHealth No.', 'PhilHealth ID'],
  'Diagnosis Description': ['Diagnosis Description', 'Description', 'Display'],
  'Referring Facility': ['Referring Facility', 'Facility'],
};

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

// ─── Field Extractors ───

type Row = { category: string; label: string; value: string };

function extractHL7Data(payload: Record<string, unknown>): Row[] {
  const vitalsObj = (payload.vitals && typeof payload.vitals === 'object') ? payload.vitals as Record<string, unknown> : null;
  const g = (k: string) => {
    if (payload[k] != null && String(payload[k]) !== '') return String(payload[k]);
    if (vitalsObj && vitalsObj[k] != null && String(vitalsObj[k]) !== '' && String(vitalsObj[k]) !== '0') return String(vitalsObj[k]);
    return '';
  };
  const rows: Row[] = [];
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
  add('Diagnosis', 'Priority', g('priority'));
  add('Referral', 'Facility', g('referring_facility_name'));
  add('Referral', 'Physician', g('referring_physician'));

  return rows;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFHIRData(payload: Record<string, unknown>): Row[] {
  const rows: Row[] = [];
  const add = (cat: string, label: string, val: unknown) => { if (val != null && String(val).trim()) rows.push({ category: cat, label, value: String(val).trim() }); };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries = (payload as any)?.entry || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resources = entries.map((e: any) => e?.resource).filter(Boolean);
  if (resources.length === 0 && (payload as Record<string, unknown>)?.resourceType) {
    resources.push(payload);
  }

  let chiefComplaintFound = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const res of resources as any[]) {
    const rt = res?.resourceType;
    if (rt === 'Patient') {
      const name = res.name?.[0] || {};
      const givenArr = name.given || [];
      add('Patient', 'Given Name', givenArr[0]);
      add('Patient', 'Middle Name', givenArr.length > 1 ? givenArr.slice(1).join(' ') : null);
      add('Patient', 'Family Name', name.family);
      add('Patient', 'Suffix', name.suffix?.[0]);
      add('Patient', 'Birth Date', res.birthDate);
      add('Patient', 'Gender', res.gender);
      add('Patient', 'Marital Status', res.maritalStatus?.text || res.maritalStatus?.coding?.[0]?.display);
      for (const id of (res.identifier || [])) {
        if (id.system?.includes('philhealth') || id.type?.coding?.[0]?.code === 'SB') {
          add('Patient', 'PhilHealth No.', id.value);
        }
      }
      for (const t of (res.telecom || [])) {
        add('Patient', 'Phone', t.value);
      }
      const addr = res.address?.[0] || {};
      add('Patient', 'Address Line', (addr.line || []).join(', '));
      add('Patient', 'City', addr.city);
      add('Patient', 'Province/State', addr.state || addr.district);
    }
    if (rt === 'Encounter') {
      add('Encounter', 'Class', res.class?.display || res.class?.code);
      add('Encounter', 'Priority', res.priority?.coding?.[0]?.display || res.priority?.coding?.[0]?.code || res.priority?.text || res.priority);
      const reason = res.reasonCode?.[0]?.text || res.reasonCode?.[0]?.coding?.[0]?.display || res.reason?.[0]?.concept?.text;
      add('Encounter', 'Reason', reason);
      if (reason && !chiefComplaintFound) { /* fallback later */ }
      add('Encounter', 'Facility', res.serviceProvider?.display || res.serviceProvider?.reference || res.location?.[0]?.location?.display);
      add('Encounter', 'Physician', res.participant?.[0]?.individual?.display || res.participant?.[0]?.actor?.display);
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
      const complaint = res.note?.[0]?.text || res.category?.[0]?.text;
      if (complaint) {
        add('Diagnosis', 'Chief Complaint', complaint);
        chiefComplaintFound = true;
      }
    }
  }

  if (!chiefComplaintFound) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const res of resources as any[]) {
      if (res?.resourceType === 'Encounter') {
        const reason = res.reasonCode?.[0]?.text || res.reasonCode?.[0]?.coding?.[0]?.display || res.reason?.[0]?.concept?.text;
        if (reason) {
          add('Diagnosis', 'Chief Complaint', reason);
          break;
        }
      }
    }
  }

  return rows;
}

function extractDataFields(payload: Record<string, unknown>): Row[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((payload as any)?.resourceType === 'Bundle' || (payload as any)?.entry) return extractFHIRData(payload);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((payload as any)?.resourceType) return extractFHIRData(payload);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((payload as any)?.patient_fname || (payload as any)?.patient_lname || (payload as any)?.philhealth_no || (payload as any)?.bp_systolic) return extractHL7Data(payload);
  const hl7 = extractHL7Data(payload);
  if (hl7.length > 0) return hl7;
  return extractFHIRData(payload);
}

// ─── Matching Logic ───

function findValueForTemplateField(
  templateLabel: string,
  extractedFields: Row[],
  isDestWAH: boolean
): string | null {
  const direct = extractedFields.find(f => f.label === templateLabel);
  if (direct) return direct.value;

  const aliases = EXTRACTOR_ALIASES[templateLabel];
  if (aliases) {
    for (const alias of aliases) {
      const found = extractedFields.find(f => f.label === alias);
      if (found) return found.value;
    }
  }

  const lower = templateLabel.toLowerCase();
  const ci = extractedFields.find(f => f.label.toLowerCase() === lower);
  if (ci) return ci.value;

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

// ─── Public API ───

export interface MappingResult {
  totalFields: number;
  filledFields: number;
  emptyFields: number;
  percentage: number;
}

/**
 * Calculate the mapping completeness percentage for a transaction.
 * @param transformedPayload The AI-transformed output payload
 * @param destinationSystem The destination system name (e.g. 'WAH', 'iHOMIS')
 */
export function calculateMappingPercentage(
  transformedPayload: Record<string, unknown> | null,
  destinationSystem: string
): MappingResult {
  if (!transformedPayload) {
    return { totalFields: 0, filledFields: 0, emptyFields: 0, percentage: 0 };
  }

  const isDestWAH = destinationSystem.toLowerCase().includes('wah');
  const template = isDestWAH ? WAH_TEMPLATE : IHOMIS_TEMPLATE;
  const extracted = extractDataFields(transformedPayload);

  let filled = 0;
  for (const tf of template) {
    const val = findValueForTemplateField(tf.label, extracted, isDestWAH);
    if (val) filled++;
  }

  const total = template.length;
  const pct = total > 0 ? Number(((filled / total) * 100).toFixed(1)) : 0;

  return {
    totalFields: total,
    filledFields: filled,
    emptyFields: total - filled,
    percentage: pct,
  };
}

/**
 * Calculate source-side field fill count.
 */
export function calculateSourceFillCount(
  rawPayload: Record<string, unknown> | null,
  sourceSystem: string
): MappingResult {
  if (!rawPayload) {
    return { totalFields: 0, filledFields: 0, emptyFields: 0, percentage: 0 };
  }

  const isSrcWAH = sourceSystem.toLowerCase().includes('wah');
  const template = isSrcWAH ? WAH_TEMPLATE : IHOMIS_TEMPLATE;
  const extracted = extractDataFields(rawPayload);

  let filled = 0;
  for (const tf of template) {
    const val = findValueForTemplateField(tf.label, extracted, isSrcWAH);
    if (val) filled++;
  }

  const total = template.length;
  const pct = total > 0 ? Number(((filled / total) * 100).toFixed(1)) : 0;

  return {
    totalFields: total,
    filledFields: filled,
    emptyFields: total - filled,
    percentage: pct,
  };
}
