'use client';
import { useState } from 'react';
import WAHSidebar from '@/components/Sidebar';
import ConsentFormModal from '@/components/ConsentFormModal';

async function safeFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { success: false, message: 'Invalid response from server' }; }
}

const WAH_SAMPLE = [
  {
    family: 'Reyes', given: 'Ana', middle: 'Cruz', suffix: '', gender: 'female',
    birthDate: '1988-11-20', philhealthNo: '0506-0708-0910', phone: '0918-765-4321',
    addressLine: '456 Bonifacio Avenue', city: 'Quezon City', province: 'Metro Manila', postalCode: '1100', maritalStatus: 'M',
    encClass: 'AMB', encPriority: 'routine',
    reasonText: 'Follow-up consultation for hypertension management', facilityName: 'WAH General Clinic', physicianName: 'Dr. Ana Reyes',
    bpSys: '135', bpDia: '85', hr: '78', temp: '36.8', rr: '16', spo2: '97', weight: '58', height: '160',
    diagCode: 'I10', diagDisplay: 'Essential (primary) hypertension', diagClinical: 'active',
    chiefComplaint: 'Elevated blood pressure during routine check-up',
  },
  {
    family: 'Mercado', given: 'Luis', middle: 'Gomez', suffix: 'Sr.', gender: 'male',
    birthDate: '1965-03-14', philhealthNo: '1122-3344-5566', phone: '0922-333-4444',
    addressLine: '789 Kalayaan St', city: 'Pasig City', province: 'Metro Manila', postalCode: '1600', maritalStatus: 'M',
    encClass: 'EMER', encPriority: 'stat',
    reasonText: 'Sudden onset of severe abdominal pain', facilityName: 'WAH General Clinic', physicianName: 'Dr. Carlos Mendoza',
    bpSys: '150', bpDia: '95', hr: '92', temp: '37.5', rr: '22', spo2: '95', weight: '75', height: '172',
    diagCode: 'R10.0', diagDisplay: 'Acute abdomen', diagClinical: 'active',
    chiefComplaint: 'Sharp pain in lower right quadrant',
  },
  {
    family: 'Santos', given: 'Elena', middle: 'Bautista', suffix: '', gender: 'female',
    birthDate: '1995-07-22', philhealthNo: '9988-7766-5544', phone: '0999-888-7777',
    addressLine: '101 Mango Ave, Brgy. Lahug', city: 'Cebu City', province: 'Cebu', postalCode: '6000', maritalStatus: 'S',
    encClass: 'AMB', encPriority: 'urgent',
    reasonText: 'High fever and chills for 4 days', facilityName: 'WAH General Clinic', physicianName: 'Dr. Patricia Lim',
    bpSys: '110', bpDia: '70', hr: '105', temp: '39.2', rr: '20', spo2: '98', weight: '52', height: '158',
    diagCode: 'A90', diagDisplay: 'Dengue fever, unspecified', diagClinical: 'active',
    chiefComplaint: 'Fever, body aches, and fatigue',
  },
  {
    family: 'Villanueva', given: 'Jose', middle: 'Alcantara', suffix: '', gender: 'male',
    birthDate: '2010-09-05', philhealthNo: '1234-5678-9012', phone: '0915-123-9876',
    addressLine: '33 Sunflower St', city: 'Baguio City', province: 'Benguet', postalCode: '2600', maritalStatus: 'S',
    encClass: 'AMB', encPriority: 'routine',
    reasonText: 'Allergic reaction and skin rash', facilityName: 'WAH General Clinic', physicianName: 'Dr. Ramon Perez',
    bpSys: '105', bpDia: '65', hr: '88', temp: '36.5', rr: '18', spo2: '99', weight: '45', height: '150',
    diagCode: 'L50.9', diagDisplay: 'Urticaria, unspecified', diagClinical: 'active',
    chiefComplaint: 'Itchy red welts all over arms and chest',
  },
  {
    family: 'Garcia', given: 'Carmen', middle: 'Fernandez', suffix: '', gender: 'female',
    birthDate: '1950-12-10', philhealthNo: '5566-7788-9900', phone: '0905-555-6666',
    addressLine: '202 Sampaguita Lane', city: 'Davao City', province: 'Davao del Sur', postalCode: '8000', maritalStatus: 'W',
    encClass: 'AMB', encPriority: 'routine',
    reasonText: 'Routine check-up for diabetes management', facilityName: 'WAH General Clinic', physicianName: 'Dr. Roberto Cruz',
    bpSys: '140', bpDia: '85', hr: '72', temp: '36.6', rr: '16', spo2: '96', weight: '68', height: '155',
    diagCode: 'E11.9', diagDisplay: 'Type 2 diabetes mellitus without complications', diagClinical: 'active',
    chiefComplaint: 'Occasional numbness in toes',
  }
];

export default function SaveFHIRRecordPage() {
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{type:'success'|'error', msg:string}|null>(null);
  const [consentSigned, setConsentSigned] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [form, setForm] = useState({
    family: '', given: '', middle: '', suffix: '', gender: 'male',
    birthDate: '', philhealthNo: '', phone: '',
    addressLine: '', city: '', province: '', postalCode: '', maritalStatus: 'S',
    encClass: 'AMB', encPriority: 'routine',
    reasonText: '', facilityName: 'WAH General Clinic', physicianName: '',
    bpSys: '', bpDia: '', hr: '', temp: '', rr: '', spo2: '', weight: '', height: '',
    diagCode: '', diagDisplay: '', diagClinical: 'active',
    chiefComplaint: '',
  });

  const update = (f: string, v: string) => setForm(p => ({ ...p, [f]: v }));
  const showToast = (type: 'success'|'error', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 4000); };
  const autoFill = () => {
    const randomData = WAH_SAMPLE[Math.floor(Math.random() * WAH_SAMPLE.length)];
    setForm(p => ({ ...p, ...randomData }));
  };

  const buildFHIRBundle = () => {
    const patientId = `urn:uuid:patient-${Date.now()}`;
    const encounterId = `urn:uuid:encounter-${Date.now()}`;
    const conditionId = `urn:uuid:condition-${Date.now()}`;
    const observations: Array<Record<string,unknown>> = [];

    if (form.bpSys && form.bpDia) {
      observations.push({
        fullUrl: `urn:uuid:obs-bp-${Date.now()}`, resource: {
          resourceType: 'Observation', status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
          code: { coding: [{ system: 'http://loinc.org', code: '85354-9', display: 'Blood pressure panel' }], text: 'Blood Pressure' },
          subject: { reference: patientId }, encounter: { reference: encounterId }, effectiveDateTime: new Date().toISOString(),
          component: [
            { code: { coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic blood pressure' }] }, valueQuantity: { value: Number(form.bpSys), unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' } },
            { code: { coding: [{ system: 'http://loinc.org', code: '8462-4', display: 'Diastolic blood pressure' }] }, valueQuantity: { value: Number(form.bpDia), unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' } },
          ],
        }, request: { method: 'POST', url: 'Observation' },
      });
    }
    const simpleVitals = [
      { field: 'hr', code: '8867-4', display: 'Heart rate', unit: '/min', ucum: '/min' },
      { field: 'temp', code: '8310-5', display: 'Body temperature', unit: 'Cel', ucum: 'Cel' },
      { field: 'rr', code: '9279-1', display: 'Respiratory rate', unit: '/min', ucum: '/min' },
      { field: 'spo2', code: '2708-6', display: 'Oxygen saturation', unit: '%', ucum: '%' },
      { field: 'weight', code: '29463-7', display: 'Body weight', unit: 'kg', ucum: 'kg' },
      { field: 'height', code: '8302-2', display: 'Body height', unit: 'cm', ucum: 'cm' },
    ];
    for (const v of simpleVitals) {
      const val = (form as Record<string,string>)[v.field];
      if (val) {
        observations.push({
          fullUrl: `urn:uuid:obs-${v.field}-${Date.now()}`, resource: {
            resourceType: 'Observation', status: 'final',
            category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
            code: { coding: [{ system: 'http://loinc.org', code: v.code, display: v.display }], text: v.display },
            subject: { reference: patientId }, encounter: { reference: encounterId }, effectiveDateTime: new Date().toISOString(),
            valueQuantity: { value: Number(val), unit: v.unit, system: 'http://unitsofmeasure.org', code: v.ucum },
          }, request: { method: 'POST', url: 'Observation' },
        });
      }
    }

    return {
      resourceType: 'Bundle', type: 'transaction', timestamp: new Date().toISOString(),
      entry: [
        {
          fullUrl: patientId, resource: {
            resourceType: 'Patient', meta: { profile: ['http://fhir.ph/StructureDefinition/ph-core-patient'] },
            identifier: [{ use: 'official', type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'SB' }] }, system: 'https://www.philhealth.gov.ph/memberid', value: form.philhealthNo }],
            name: [{ use: 'official', family: form.family, given: [form.given, form.middle].filter(Boolean), ...(form.suffix ? { suffix: [form.suffix] } : {}) }],
            gender: form.gender, birthDate: form.birthDate,
            telecom: form.phone ? [{ system: 'phone', value: form.phone, use: 'mobile' }] : [],
            address: [{ use: 'home', line: [form.addressLine].filter(Boolean), city: form.city, district: form.province, postalCode: form.postalCode, country: 'PH' }],
          }, request: { method: 'POST', url: 'Patient' },
        },
        {
          fullUrl: encounterId, resource: {
            resourceType: 'Encounter', status: 'in-progress',
            class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: form.encClass },
            priority: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ActPriority', code: form.encPriority === 'emergency' ? 'EM' : form.encPriority === 'urgent' ? 'UR' : 'R' }] },
            subject: { reference: patientId }, period: { start: new Date().toISOString() },
            reasonCode: form.reasonText ? [{ text: form.reasonText }] : [],
            serviceProvider: { display: form.facilityName },
            participant: form.physicianName ? [{ individual: { display: form.physicianName } }] : [],
          }, request: { method: 'POST', url: 'Encounter' },
        },
        ...observations,
        {
          fullUrl: conditionId, resource: {
            resourceType: 'Condition',
            clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: form.diagClinical }] },
            verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'provisional' }] },
            category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'encounter-diagnosis' }] }],
            code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: form.diagCode, display: form.diagDisplay }], text: form.diagDisplay },
            subject: { reference: patientId }, encounter: { reference: encounterId },
            note: form.chiefComplaint ? [{ text: form.chiefComplaint }] : [],
          }, request: { method: 'POST', url: 'Condition' },
        },
        // Consent Resource — tracks patient data privacy consent
        ...(consentSigned ? [{
          fullUrl: `urn:uuid:consent-${Date.now()}`, resource: {
            resourceType: 'Consent',
            status: 'active',
            scope: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy', display: 'Privacy Consent' }] },
            category: [{ coding: [{ system: 'http://loinc.org', code: '59284-0', display: 'Patient Consent' }] }],
            patient: { reference: patientId },
            dateTime: new Date().toISOString(),
            policy: [{ authority: 'https://www.privacy.gov.ph', uri: 'https://www.privacy.gov.ph/data-privacy-act/' }],
            provision: { type: 'permit' },
          }, request: { method: 'POST', url: 'Consent' },
        }] : []),
      ],
    };
  };

  const handleSave = async () => {
    if (!form.given || !form.family || !form.philhealthNo) {
      showToast('error', 'Required: Given Name, Family Name, PhilHealth ID');
      return;
    }
    setSaving(true);
    try {
      const fhirBundle = buildFHIRBundle();
      const data = await safeFetch('/api/patients', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_name: `${form.family}, ${form.given} ${form.middle}`.trim(),
          philhealth_no: form.philhealthNo, gender: form.gender,
          birth_date: form.birthDate || null,
          diagnosis_code: form.diagCode, diagnosis_display: form.diagDisplay,
          fhir_bundle: fhirBundle,
          consent_signed: consentSigned,
        }),
      });
      if (data.success) {
        showToast('success', 'FHIR record saved. Go to Records & Send to transmit.');
        setForm(prev => ({ ...prev, family: '', given: '', middle: '', philhealthNo: '', diagCode: '', diagDisplay: '', chiefComplaint: '' }));
        setConsentSigned(false);
      } else showToast('error', data.message || 'Failed to save');
    } catch { showToast('error', 'Failed to save record'); }
    finally { setSaving(false); }
  };

  const Field = ({ label, field, type='text', required=false, placeholder='' }: {label:string;field:string;type?:string;required?:boolean;placeholder?:string}) => (
    <div>
      <label className="wah-label">{label}{required && <span style={{color:'var(--color-error)'}}> *</span>}</label>
      <input type={type} className="wah-input" value={(form as Record<string,string>)[field]} onChange={e => update(field, e.target.value)} placeholder={placeholder} />
    </div>
  );

  return (
    <>
      <WAHSidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">New FHIR Patient Record</h1>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Create a PH Core FHIR R4 Bundle. Send to DOH later from Records tab.</p>
          </div>
          <button onClick={autoFill} className="wah-btn wah-btn-secondary text-xs">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            Auto-fill Sample
          </button>
        </div>
        <div className="max-w-4xl space-y-4">
          <div className="wah-card p-5">
            <h2 className="wah-section-title flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Patient Resource
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Given Name" field="given" required placeholder="Maria" />
              <Field label="Middle Name" field="middle" placeholder="Santos" />
              <Field label="Family Name" field="family" required placeholder="Dela Cruz" />
              <Field label="Birth Date" field="birthDate" type="date" />
              <div><label className="wah-label">Gender</label><select className="wah-input" value={form.gender} onChange={e => update('gender', e.target.value)}><option value="male">Male</option><option value="female">Female</option></select></div>
              <Field label="PhilHealth ID" field="philhealthNo" required placeholder="0102-0304-0506" />
              <Field label="Phone" field="phone" placeholder="09XX-XXX-XXXX" />
              <Field label="Address" field="addressLine" placeholder="123 Rizal St" />
              <Field label="City" field="city" placeholder="Makati City" />
            </div>
          </div>
          <div className="wah-card p-5">
            <h2 className="wah-section-title flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              Encounter
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div><label className="wah-label">Class</label><select className="wah-input" value={form.encClass} onChange={e => update('encClass', e.target.value)}><option value="AMB">Ambulatory</option><option value="IMP">Inpatient</option><option value="EMER">Emergency</option></select></div>
              <div><label className="wah-label">Priority</label><select className="wah-input" value={form.encPriority} onChange={e => update('encPriority', e.target.value)}><option value="routine">Routine</option><option value="urgent">Urgent</option><option value="emergency">Emergency</option></select></div>
              <Field label="Facility" field="facilityName" placeholder="WAH General Clinic" />
              <Field label="Physician" field="physicianName" placeholder="Dr. Ana Reyes" />
              <Field label="Reason" field="reasonText" placeholder="Specialist consult" />
            </div>
          </div>
          <div className="wah-card p-5">
            <h2 className="wah-section-title flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
              Observations (Vitals)
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="BP Systolic (mmHg)" field="bpSys" type="number" placeholder="120" />
              <Field label="BP Diastolic (mmHg)" field="bpDia" type="number" placeholder="80" />
              <Field label="Heart Rate (bpm)" field="hr" type="number" placeholder="72" />
              <Field label="Temperature (°C)" field="temp" type="number" placeholder="36.5" />
              <Field label="Respiratory Rate" field="rr" type="number" placeholder="18" />
              <Field label="SpO2 (%)" field="spo2" type="number" placeholder="98" />
              <Field label="Weight (kg)" field="weight" type="number" placeholder="65" />
              <Field label="Height (cm)" field="height" type="number" placeholder="165" />
            </div>
          </div>
          <div className="wah-card p-5">
            <h2 className="wah-section-title flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
              Condition
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="ICD-10 Code" field="diagCode" placeholder="J18.9" />
              <Field label="Display" field="diagDisplay" placeholder="Pneumonia, unspecified" />
              <Field label="Chief Complaint" field="chiefComplaint" placeholder="Persistent cough" />
              <div><label className="wah-label">Clinical Status</label><select className="wah-input" value={form.diagClinical} onChange={e => update('diagClinical', e.target.value)}><option value="active">Active</option><option value="resolved">Resolved</option></select></div>
            </div>
          </div>
          {/* Data Privacy Consent */}
          <div className="wah-card p-5">
            <h2 className="wah-section-title flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              Data Privacy & Consent
            </h2>
            <div className="consent-section">
              <div className="flex items-start gap-3 mb-3">
                <label className="consent-checkbox-wrapper">
                  <input
                    type="checkbox"
                    checked={consentSigned}
                    onChange={e => setConsentSigned(e.target.checked)}
                    className="consent-checkbox"
                  />
                  <span className="consent-checkmark" />
                </label>
                <div className="flex-1">
                  <p className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    Patient has read and agreed to the Data Privacy Consent Form
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    Required under Republic Act 10173 (Data Privacy Act of 2012). Records without consent will be quarantined.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConsent(true)}
                className="consent-view-link"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                View Patient Consent Form
              </button>
              {!consentSigned && (
                <div className="consent-warning mt-3">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span className="text-xs">Without consent, this record will be quarantined when sent to DOH/iPaaS.</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={handleSave} disabled={saving} className="wah-btn wah-btn-primary px-6 py-2.5">
              {saving ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</>
              ) : (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save FHIR Record</>
              )}
            </button>
          </div>
        </div>
        {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
        <ConsentFormModal open={showConsent} onClose={() => setShowConsent(false)} />
      </main>
    </>
  );
}
