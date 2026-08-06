'use client';
import { useState, useEffect } from 'react';
import WAHSidebar from '@/components/Sidebar';

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_API_URL || 'http://localhost:3001/api';

async function safeFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { success: false, data: [] }; }
}

interface OrgOption {
  id: string; name: string; code: string; data_format: string;
}

interface OutboundRequest {
  id: string;
  target_org: string;
  target_org_id: string;
  philhealth_no: string;
  patient_name: string;
  request_reason: string;
  status: string;
  error_message?: string;
  created_at: string;
}

const FORMAT_LABELS: Record<string, string> = { HL7V2: 'HL7 v2', FHIR_R4: 'FHIR R4', CDA_R2: 'CDA R2' };

export default function RequestDataPage() {
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string>('');
  const [philhealth, setPhilhealth] = useState('');
  const [patientName, setPatientName] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState<OutboundRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{type:'success'|'error', msg:string}|null>(null);

  const showToast = (type: 'success'|'error', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 4000); };

  const autoFill = () => {
    setPhilhealth('0102-0304-0506');
    setPatientName('Dela Cruz, Juan');
    setReason('Patient transfer — follow-up care required');
  };

  const fetchOrgs = async () => {
    try {
      const data = await safeFetch(`${PORTAL_URL}/orgs`);
      if (data.success && data.data) {
        setOrgs(data.data);
        if (data.data.length > 0 && !selectedOrg) setSelectedOrg(data.data[0].id);
      }
    } catch { console.warn('[WAH] Could not fetch orgs'); }
  };

  const fetchRequests = async () => {
    const data = await safeFetch('/api/outbound-requests');
    if (data.success) {
      const sorted = (data.data || []).sort((a: OutboundRequest, b: OutboundRequest) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setRequests(sorted);
    }
    setLoading(false);
  };

  useEffect(() => { fetchOrgs(); fetchRequests(); const i = setInterval(fetchRequests, 5000); return () => clearInterval(i); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) { showToast('error', 'Select a target organization'); return; }
    if (!philhealth && !patientName) { showToast('error', 'Provide PhilHealth No. or Patient Name'); return; }

    const org = orgs.find(o => o.id === selectedOrg);
    if (!org) return;

    setSubmitting(true);
    try {
      const data = await safeFetch('/api/outbound-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_org: org.name,
          target_org_id: org.id,
          destination_format: org.data_format,
          philhealth_no: philhealth,
          patient_name: patientName,
          request_reason: reason,
        }),
      });
      if (data.success) {
        showToast('success', `Request sent to ${org.name}`);
        setPhilhealth(''); setPatientName(''); setReason('');
        fetchRequests();
      } else {
        showToast('error', data.message || 'Failed to send request');
      }
    } catch { showToast('error', 'Failed to connect'); }
    finally { setSubmitting(false); }
  };

  const getSelectedOrg = () => orgs.find(o => o.id === selectedOrg);

  return (
    <>
      <WAHSidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="mb-5">
          <h1 className="text-lg font-semibold">Request Data from Organization</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Request patient records from a registered organization. Data will be converted to FHIR R4 automatically.
          </p>
        </div>

        {/* Request Form */}
        <div className="wah-card p-6 mb-6 max-w-2xl">
          <div className="flex items-center justify-between mb-4 border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              New Data Request
            </h2>
            <button onClick={autoFill} className="wah-btn wah-btn-secondary text-xs py-1.5 px-3">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
              Auto-fill Sample
            </button>
          </div>

          {/* Destination Org Selector */}
          <div className="mb-4">
            <label className="wah-label">Target Organization</label>
            <select value={selectedOrg} onChange={e => setSelectedOrg(e.target.value)} className="wah-input">
              {orgs.length === 0 && <option>Loading organizations...</option>}
              {orgs.map(o => (
                <option key={o.id} value={o.id}>{o.name} ({o.code}) — {FORMAT_LABELS[o.data_format] || o.data_format}</option>
              ))}
            </select>
            {getSelectedOrg() && (
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                Will request data in <strong>{FORMAT_LABELS[getSelectedOrg()!.data_format]}</strong> format, converted to <strong>FHIR R4</strong> by iPaaS
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="wah-label">PhilHealth No.</label>
                <input type="text" className="wah-input" value={philhealth} onChange={e => setPhilhealth(e.target.value)} placeholder="0102-0304-0506" />
              </div>
              <div>
                <label className="wah-label">Patient Name</label>
                <input type="text" className="wah-input" value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="Dela Cruz, Juan" />
              </div>
            </div>
            <div>
              <label className="wah-label">Reason for Request</label>
              <input type="text" className="wah-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Patient transfer, follow-up care, etc." />
            </div>
            <button type="submit" className="wah-btn wah-btn-primary text-sm px-5 py-2" disabled={submitting}>
              {submitting ? 'Sending...' : 'Submit Request'}
            </button>
          </form>
        </div>

        {/* Request History */}
        <div className="wah-card overflow-hidden max-w-4xl">
          <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
            <div>
              <h2 className="text-sm font-semibold">Request History</h2>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Your outbound data requests</p>
            </div>
            <button onClick={() => { setLoading(true); fetchRequests(); }} className="wah-btn wah-btn-secondary text-xs">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-accent-bright)' }} />
            </div>
          ) : requests.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No requests sent yet.</p>
            </div>
          ) : (
            <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Organization</th><th>PhilHealth</th><th>Patient</th><th>Status</th><th>Date</th></tr></thead>
                <tbody>
                  {requests.map(req => {
                    const statusColors: Record<string, { bg: string; color: string }> = {
                      PENDING: { bg: 'rgba(245,158,11,0.1)', color: '#fbbf24' },
                      COMPLETED: { bg: 'rgba(16,185,129,0.1)', color: '#34d399' },
                      FAILED: { bg: 'rgba(239,68,68,0.1)', color: '#f87171' },
                      DECLINED: { bg: 'rgba(239,68,68,0.1)', color: '#f87171' },
                    };
                    const st = statusColors[req.status] || statusColors.PENDING;
                    return (
                      <tr key={req.id}>
                        <td className="text-sm">{req.target_org}</td>
                        <td className="text-xs font-mono">{req.philhealth_no || '—'}</td>
                        <td className="text-sm">{req.patient_name || '—'}</td>
                        <td>
                          <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: st.bg, color: st.color }}>{req.status}</span>
                        </td>
                        <td className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{new Date(req.created_at).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      </main>
    </>
  );
}
