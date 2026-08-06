'use client';
import { useState, useEffect } from 'react';
import ConsentFormModal from '@/components/ConsentFormModal';
import { getCurrentOrg, type OrgProfile } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

async function safeFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { success: false, message: 'Invalid response' }; }
}

const SAMPLE_DATA = {
  patient_fname: 'Juan', patient_lname: 'Dela Cruz', patient_mname: 'Santos', patient_suffix: '',
  dob: '1990-05-15', sex: 'M', civil_status: 'M',
  philhealth_no: '0102-0304-0506', contact_no: '0917-123-4567',
  address_street: '123 Rizal Street', address_barangay: 'Brgy. San Antonio',
  address_city: 'Makati City', address_province: 'Metro Manila', address_zip: '1200',
  bp_systolic: '120', bp_diastolic: '80', heart_rate: '72', temperature: '36.5',
  respiratory_rate: '18', oxygen_saturation: '98', weight_kg: '65', height_cm: '170',
  chief_complaint: 'Persistent cough and mild fever for 3 days',
  diagnosis_code: 'J18.9', diagnosis_desc: 'Pneumonia, unspecified organism', diagnosis_type: 'admitting',
  clinical_notes: 'Patient referred for further evaluation and management',
  referring_facility_code: 'DOH-001', referring_facility_name: 'DOH General Hospital',
  referring_physician: 'Dr. Maria Santos', referring_physician_license: 'PRC-12345',
  referral_reason: 'Specialist consult for respiratory condition', priority: 'ROUTINE',
};

export default function SavePatientPage() {
  const router = useRouter();
  const [org, setOrg] = useState<OrgProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{type:'success'|'error', msg:string}|null>(null);
  const [consentSigned, setConsentSigned] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [form, setForm] = useState({
    patient_fname: '', patient_lname: '', patient_mname: '', patient_suffix: '',
    dob: '', sex: 'M', civil_status: 'S',
    philhealth_no: '', contact_no: '',
    address_street: '', address_barangay: '', address_city: '', address_province: '', address_zip: '',
    bp_systolic: '', bp_diastolic: '', heart_rate: '', temperature: '',
    respiratory_rate: '', oxygen_saturation: '', weight_kg: '', height_cm: '',
    chief_complaint: '', diagnosis_code: '', diagnosis_desc: '', diagnosis_type: 'admitting',
    clinical_notes: '', referring_facility_code: 'DOH-001', referring_facility_name: 'DOH General Hospital',
    referring_physician: '', referring_physician_license: '', referral_reason: '', priority: 'ROUTINE',
  });

  useEffect(() => {
    getCurrentOrg().then(o => {
      if (!o) { router.push('/login'); return; }
      setOrg(o);
      // Set the referring facility to the org
      setForm(prev => ({
        ...prev,
        referring_facility_code: o.code,
        referring_facility_name: o.name,
      }));
    });
  }, [router]);

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));
  const showToast = (type: 'success'|'error', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 4000); };
  const autoFill = () => setForm(prev => ({ ...prev, ...SAMPLE_DATA, referring_facility_code: org?.code || 'DOH-001', referring_facility_name: org?.name || 'DOH General Hospital' }));

  const handleSave = async () => {
    if (!form.patient_fname || !form.patient_lname || !form.philhealth_no) {
      showToast('error', 'Required: First Name, Last Name, PhilHealth No.');
      return;
    }
    if (!org) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        vitals: {
          bp_systolic: Number(form.bp_systolic) || 0, bp_diastolic: Number(form.bp_diastolic) || 0,
          heart_rate: Number(form.heart_rate) || 0, temperature: Number(form.temperature) || 0,
          respiratory_rate: Number(form.respiratory_rate) || 0,
          oxygen_saturation: form.oxygen_saturation ? Number(form.oxygen_saturation) : null,
          weight_kg: Number(form.weight_kg) || 0, height_cm: Number(form.height_cm) || 0,
        },
      };
      const data = await safeFetch('/api/patients', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: org.id, patient_data: payload, consent_signed: consentSigned }),
      });
      if (data.success) {
        showToast('success', 'Patient record saved.');
        setForm(prev => ({ ...prev, patient_fname: '', patient_lname: '', patient_mname: '', philhealth_no: '', chief_complaint: '', diagnosis_code: '', diagnosis_desc: '' }));
        setConsentSigned(false);
      } else showToast('error', data.message || 'Failed to save');
    } catch { showToast('error', 'Failed to save record'); }
    finally { setSaving(false); }
  };

  const Field = ({ label, field, type = 'text', required = false, placeholder = '' }: { label: string; field: string; type?: string; required?: boolean; placeholder?: string }) => (
    <div>
      <label className="portal-label">{label}{required && <span style={{color:'var(--color-error)'}}> *</span>}</label>
      <input type={type} className="portal-input" value={(form as Record<string,string>)[field]} onChange={e => update(field, e.target.value)} placeholder={placeholder} />
    </div>
  );

  if (!org) return null;

  const FORMAT_LABELS: Record<string, string> = { HL7V2: 'HL7 v2', FHIR_R4: 'FHIR R4', CDA_R2: 'CDA R2' };

  return (
    <>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">New Patient Record</h1>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Save patient data locally. Data will be sent as <strong>{FORMAT_LABELS[org.data_format]}</strong> format when exchanged.
            </p>
          </div>
          <button onClick={autoFill} className="portal-btn portal-btn-secondary text-xs">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            Auto-fill Sample
          </button>
        </div>
        <div className="max-w-4xl space-y-4">
          <div className="portal-card p-5">
            <h2 className="portal-section-title flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Patient Demographics
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="First Name" field="patient_fname" required placeholder="Juan" />
              <Field label="Middle Name" field="patient_mname" placeholder="Santos" />
              <Field label="Last Name" field="patient_lname" required placeholder="Dela Cruz" />
              <Field label="Suffix" field="patient_suffix" placeholder="Jr, Sr" />
              <Field label="Date of Birth" field="dob" type="date" />
              <div><label className="portal-label">Sex <span style={{color:'var(--color-error)'}}>*</span></label>
                <select className="portal-input" value={form.sex} onChange={e => update('sex', e.target.value)}><option value="M">Male</option><option value="F">Female</option></select></div>
              <Field label="PhilHealth No." field="philhealth_no" required placeholder="0102-0304-0506" />
              <Field label="Contact No." field="contact_no" placeholder="09XX-XXX-XXXX" />
              <div><label className="portal-label">Civil Status</label>
                <select className="portal-input" value={form.civil_status} onChange={e => update('civil_status', e.target.value)}>
                  <option value="S">Single</option><option value="M">Married</option><option value="W">Widowed</option></select></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <Field label="Street" field="address_street" placeholder="123 Rizal Street" />
              <Field label="Barangay" field="address_barangay" placeholder="Brgy. San Antonio" />
              <Field label="City" field="address_city" placeholder="Makati City" />
              <Field label="Province" field="address_province" placeholder="Metro Manila" />
            </div>
          </div>
          <div className="portal-card p-5">
            <h2 className="portal-section-title flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
              Vital Signs
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="BP Systolic" field="bp_systolic" type="number" placeholder="120" />
              <Field label="BP Diastolic" field="bp_diastolic" type="number" placeholder="80" />
              <Field label="Heart Rate" field="heart_rate" type="number" placeholder="72" />
              <Field label="Temp (°C)" field="temperature" type="number" placeholder="36.5" />
              <Field label="Resp. Rate" field="respiratory_rate" type="number" placeholder="18" />
              <Field label="SpO2 (%)" field="oxygen_saturation" type="number" placeholder="98" />
              <Field label="Weight (kg)" field="weight_kg" type="number" placeholder="65" />
              <Field label="Height (cm)" field="height_cm" type="number" placeholder="170" />
            </div>
          </div>
          <div className="portal-card p-5">
            <h2 className="portal-section-title flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
              Diagnosis & Referral
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Chief Complaint" field="chief_complaint" placeholder="Persistent cough and fever" />
              <Field label="ICD-10 Code" field="diagnosis_code" placeholder="J18.9" />
              <Field label="Diagnosis Description" field="diagnosis_desc" placeholder="Pneumonia, unspecified" />
              <div><label className="portal-label">Priority</label>
                <select className="portal-input" value={form.priority} onChange={e => update('priority', e.target.value)}>
                  <option value="ROUTINE">Routine</option><option value="URGENT">Urgent</option><option value="EMERGENCY">Emergency</option></select></div>
              <Field label="Referring Facility" field="referring_facility_name" placeholder={org.name} />
              <Field label="Physician" field="referring_physician" placeholder="Dr. Maria Santos" />
            </div>
          </div>
          {/* Data Privacy Consent */}
          <div className="portal-card p-5">
            <h2 className="portal-section-title flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              Data Privacy & Consent
            </h2>
            <div className="consent-section">
              <div className="flex items-start gap-3 mb-3">
                <label className="consent-checkbox-wrapper">
                  <input type="checkbox" checked={consentSigned} onChange={e => setConsentSigned(e.target.checked)} className="consent-checkbox" />
                  <span className="consent-checkmark" />
                </label>
                <div className="flex-1">
                  <p className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>Patient has read and agreed to the Data Privacy Consent Form</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Required under Republic Act 10173 (Data Privacy Act of 2012). Records without consent will be quarantined.</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowConsent(true)} className="consent-view-link">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                View Patient Consent Form
              </button>
              {!consentSigned && (
                <div className="consent-warning mt-3">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                  <span className="text-xs">Without consent, this record will be quarantined when sent to WAH/iPaaS.</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={handleSave} disabled={saving} className="portal-btn portal-btn-primary px-6 py-2.5">
              {saving ? 'Saving...' : (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save Record</>
              )}
            </button>
          </div>
        </div>
        {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
        <ConsentFormModal open={showConsent} onClose={() => setShowConsent(false)} />
    </>
  );
}
