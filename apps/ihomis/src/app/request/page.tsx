'use client';
import { useState, useEffect } from 'react';
import PortalSidebar from '@/components/Sidebar';
import { getCurrentOrg, type OrgProfile } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

async function safeFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { success: false, data: [] }; }
}

interface DataRequest {
  id: string;
  requesting_org_id: string;
  target_system: string;
  philhealth_no: string | null;
  patient_name: string | null;
  request_reason: string | null;
  status: string;
  response_payload: Record<string, unknown> | null;
  transaction_id: string | null;
  error_message: string | null;
  created_at: string;
}

export default function RequestPage() {
  const router = useRouter();
  const [org, setOrg] = useState<OrgProfile | null>(null);
  const [requests, setRequests] = useState<DataRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{type:'success'|'error', msg:string}|null>(null);
  const [viewId, setViewId] = useState<string|null>(null);

  // Form
  const [philhealth, setPhilhealth] = useState('');
  const [patientName, setPatientName] = useState('');
  const [reason, setReason] = useState('');

  const showToast = (type: 'success'|'error', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 4000); };

  useEffect(() => {
    getCurrentOrg().then(o => {
      if (!o) { router.push('/login'); return; }
      setOrg(o);
      fetchRequests(o.id);
    });
  }, [router]);

  const fetchRequests = async (orgId: string) => {
    const data = await safeFetch(`/api/request?org_id=${orgId}`);
    if (data.success) setRequests(data.data || []);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org) return;
    if (!philhealth && !patientName) {
      showToast('error', 'Please enter a PhilHealth number or patient name');
      return;
    }
    setSubmitting(true);
    try {
      const data = await safeFetch('/api/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: org.id,
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
        fetchRequests(org.id);
      } else {
        showToast('error', data.message || 'Request failed');
      }
    } catch {
      showToast('error', 'Failed to submit request');
    }
    setSubmitting(false);
  };

  const statusStyle = (s: string) => {
    const m: Record<string, { bg: string; color: string }> = {
      COMPLETED: { bg: 'rgba(16,185,129,0.1)', color: '#34d399' },
      PENDING: { bg: 'rgba(245,158,11,0.1)', color: '#fbbf24' },
      PROCESSING: { bg: 'rgba(124,58,237,0.1)', color: '#a78bfa' },
      FAILED: { bg: 'rgba(239,68,68,0.1)', color: '#f87171' },
      DENIED: { bg: 'rgba(239,68,68,0.1)', color: '#f87171' },
    };
    return m[s] || m.PENDING;
  };

  const FORMAT_LABELS: Record<string, string> = { HL7V2: 'HL7 v2', FHIR_R4: 'FHIR R4', CDA_R2: 'CDA R2' };

  if (!org) return null;

  return (
    <div className="flex min-h-screen">
      <PortalSidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="mb-5">
          <h1 className="text-lg font-bold">Request Data from WAH</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Request patient records from WAH Hospital. Data will be converted from FHIR R4 → <strong>{FORMAT_LABELS[org.data_format]}</strong> automatically.
          </p>
        </div>

        {/* Request Form */}
        <div className="portal-card p-6 mb-6 max-w-2xl">
          <h2 className="portal-section-title flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            New Data Request
          </h2>
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
            <div className="flex items-center gap-3">
              <button type="submit" disabled={submitting} className="portal-btn portal-btn-teal">
                {submitting ? (
                  <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Requesting...</>
                ) : (
                  <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Request from WAH</>
                )}
              </button>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Data will arrive in {FORMAT_LABELS[org.data_format]} format</span>
            </div>
          </form>
        </div>

        {/* Request History */}
        <div className="portal-card overflow-hidden">
          <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <h2 className="text-sm font-bold">Request History</h2>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>All data requests ({requests.length})</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-accent)' }} />
            </div>
          ) : requests.length === 0 ? (
            <div className="p-10 text-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1" className="mx-auto mb-3"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No data requests yet. Submit a request above.</p>
            </div>
          ) : (
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {requests.map(req => {
                const st = statusStyle(req.status);
                return (
                  <div key={req.id} className="px-5 py-4 border-b transition-colors" style={{ borderColor: 'rgba(42,42,58,0.5)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(124,58,237,0.03)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs" style={{ color: 'var(--color-accent-bright)' }}>{req.id.slice(0, 8)}...</span>
                        <span className="status-badge" style={{ background: st.bg, color: st.color }}>{req.status}</span>
                      </div>
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{new Date(req.created_at).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      {req.philhealth_no && <span><span style={{ color: 'var(--color-text-muted)' }}>PhilHealth:</span> <strong>{req.philhealth_no}</strong></span>}
                      {req.patient_name && <span><span style={{ color: 'var(--color-text-muted)' }}>Name:</span> <strong>{req.patient_name}</strong></span>}
                      <span><span style={{ color: 'var(--color-text-muted)' }}>From:</span> <strong>{req.target_system}</strong></span>
                    </div>
                    {req.error_message && (
                      <p className="text-xs mt-2" style={{ color: '#f87171' }}>{req.error_message}</p>
                    )}
                    {req.response_payload && (
                      <div className="mt-2">
                        <button
                          onClick={() => setViewId(viewId === req.id ? null : req.id)}
                          className="text-xs font-medium flex items-center gap-1" style={{ color: 'var(--color-accent-bright)' }}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points={viewId === req.id ? "6 9 12 15 18 9" : "9 18 15 12 9 6"}/></svg>
                          {viewId === req.id ? 'Hide Data' : 'View Received Data'}
                        </button>
                        {viewId === req.id && (
                          <pre className="mt-2 p-3 rounded-lg text-xs overflow-auto whitespace-pre-wrap" style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', maxHeight: '300px' }}>
                            {JSON.stringify(req.response_payload, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      </main>
    </div>
  );
}
