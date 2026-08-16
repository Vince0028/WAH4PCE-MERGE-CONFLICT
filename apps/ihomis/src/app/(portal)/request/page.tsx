'use client';
import { useState } from 'react';
import ConsentFormModal from '@/components/ConsentFormModal';

async function safeFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { success: false, data: [] }; }
}

export default function RequestPage() {
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{type:'success'|'error', msg:string}|null>(null);
  const [consentSigned, setConsentSigned] = useState(false);
  const [showConsent, setShowConsent] = useState(false);

  // Form
  const [philhealth, setPhilhealth] = useState('');
  const [patientName, setPatientName] = useState('');
  const [reason, setReason] = useState('');

  const showToast = (type: 'success'|'error', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 4000); };
  const autoFill = () => { setPhilhealth('0102-0304-0506'); setPatientName('Dela Cruz, Juan'); setReason('Patient transfer, follow-up care, etc.'); setConsentSigned(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!philhealth && !patientName) {
      showToast('error', 'Please enter a PhilHealth number or patient name');
      return;
    }
    if (!consentSigned) {
      showToast('error', 'Patient consent is required to request data');
      return;
    }
    setSubmitting(true);
    try {
      const data = await safeFetch('/api/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          philhealth_no: philhealth || null,
          patient_name: patientName || null,
          request_reason: reason || 'Patient data transfer request',
        }),
      });
      if (data.success) {
        showToast('success', data.message || 'Request submitted successfully');
        setPhilhealth('');
        setPatientName('');
        setReason('');
      } else {
        showToast('error', data.message || 'Request failed');
      }
    } catch {
      showToast('error', 'Failed to submit request');
    }
    setSubmitting(false);
  };

  return (
    <>
        <div className="mb-5">
          <h1 className="text-lg font-bold">Request Data from WAH</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Request patient records from WAH Hospital. Data will be converted from FHIR R4 → <strong>HL7 v2</strong> automatically.
          </p>
        </div>

        {/* Request Form */}
        <div className="portal-card p-6 mb-6 max-w-2xl">
          <div className="flex items-center justify-between mb-4 border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
            <h2 className="portal-section-title flex items-center gap-2 mb-0 border-0 pb-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              New Data Request
            </h2>
            <button onClick={autoFill} className="portal-btn portal-btn-secondary text-xs py-1.5 px-3">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
              Auto-fill Sample
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="portal-label">PhilHealth No.</label>
                <input type="text" className="portal-input" value={philhealth} onChange={e => setPhilhealth(e.target.value)} placeholder="0102-0304-0506" />
              </div>
              <div>
                <label className="portal-label">Patient Name (optional)</label>
                <input type="text" className="portal-input" value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="Dela Cruz, Juan" />
              </div>
            </div>
            <div>
              <label className="portal-label">Reason for Request</label>
              <input type="text" className="portal-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Patient transfer, follow-up care, etc." />
            </div>

            {/* Data Privacy Consent */}
            <div className="consent-section mt-5 mb-4">
              <div className="flex items-start gap-3 mb-3">
                <label className="consent-checkbox-wrapper">
                  <input type="checkbox" checked={consentSigned} onChange={e => setConsentSigned(e.target.checked)} className="consent-checkbox" />
                  <span className="consent-checkmark" />
                </label>
                <div className="flex-1">
                  <p className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>Patient has read and agreed to the Data Privacy Consent Form</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Required under Republic Act 10173 (Data Privacy Act of 2012) for retrieving health data.</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowConsent(true)} className="consent-view-link">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                View Patient Consent Form
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={submitting} className="portal-btn portal-btn-teal">
                {submitting ? (
                  <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Requesting...</>
                ) : (
                  <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Request from WAH</>
                )}
              </button>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Data will arrive in HL7 v2 format</span>
            </div>
          </form>
        </div>

        {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
        <ConsentFormModal open={showConsent} onClose={() => setShowConsent(false)} />
    </>
  );
}
