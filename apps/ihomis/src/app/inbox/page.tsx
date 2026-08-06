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

interface PatientRecord {
  id: string; patient_name: string; philhealth_no: string; sex: string;
  dob: string; diagnosis_code: string; diagnosis_desc: string;
  priority: string; status: string; source: string;
  data_payload: Record<string, unknown>;
  raw_source_payload: Record<string, unknown> | null;
  created_at: string;
  consent_signed: boolean;
}

export default function InboxPage() {
  const router = useRouter();
  const [org, setOrg] = useState<OrgProfile | null>(null);
  const [records, setRecords] = useState<PatientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewId, setViewId] = useState<string|null>(null);
  const [viewRawId, setViewRawId] = useState<string|null>(null);
  const [toast, setToast] = useState<{type:'success'|'error', msg:string}|null>(null);

  const showToast = (type: 'success'|'error', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 4000); };

  useEffect(() => {
    getCurrentOrg().then(o => {
      if (!o) { router.push('/login'); return; }
      setOrg(o);
      fetchInbox(o.id);
    });
  }, [router]);

  const fetchInbox = async (orgId: string) => {
    const data = await safeFetch(`/api/patients?org_id=${orgId}&source=RECEIVED`);
    setRecords(data.data || []);
    setLoading(false);
  };

  const handleAccept = async (id: string) => {
    const data = await safeFetch('/api/patients', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'SAVED', source: 'LOCAL' }),
    });
    if (data.success) { showToast('success', 'Record accepted into local records'); if (org) fetchInbox(org.id); }
    else showToast('error', data.message || 'Failed');
  };

  const FORMAT_LABELS: Record<string, string> = { HL7V2: 'HL7 v2', FHIR_R4: 'FHIR R4', CDA_R2: 'CDA R2' };

  if (!org) return null;

  return (
    <div className="flex min-h-screen">
      <PortalSidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="mb-5">
          <h1 className="text-lg font-bold">Inbox</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Received records from WAH Hospital, converted to your {FORMAT_LABELS[org.data_format]} format.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-accent)' }} />
          </div>
        ) : records.length === 0 ? (
          <div className="portal-card p-10 text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1" className="mx-auto mb-3"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>No received records</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Records converted from WAH will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3" style={{ maxHeight: 'calc(100vh - 180px)', overflowY: 'auto', paddingRight: '4px' }}>
            {records.map(rec => (
              <div key={rec.id} className="portal-card p-4" style={{ borderLeft: '3px solid var(--color-teal)' }}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold">{rec.patient_name}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{rec.dob || 'N/A'} · {rec.sex} · PhilHealth: {rec.philhealth_no}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="status-badge" style={{ background: 'rgba(20,184,166,0.1)', color: '#2dd4bf' }}>RECEIVED</span>
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>from WAH</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3">
                  <div><span style={{ color: 'var(--color-text-muted)' }}>Dx:</span> <strong>{rec.diagnosis_code || 'N/A'}</strong></div>
                  <div><span style={{ color: 'var(--color-text-muted)' }}>Desc:</span> <strong>{rec.diagnosis_desc || 'N/A'}</strong></div>
                  <div><span style={{ color: 'var(--color-text-muted)' }}>Priority:</span> <strong>{rec.priority || 'N/A'}</strong></div>
                  <div><span style={{ color: 'var(--color-text-muted)' }}>Received:</span> <strong>{new Date(rec.created_at).toLocaleDateString()}</strong></div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => handleAccept(rec.id)} className="portal-btn portal-btn-teal text-xs px-3 py-1.5">
                    ✓ Accept to Records
                  </button>
                  <button onClick={() => setViewId(viewId === rec.id ? null : rec.id)}
                    className="text-xs font-medium flex items-center gap-1" style={{ color: 'var(--color-accent-bright)' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points={viewId === rec.id ? "6 9 12 15 18 9" : "9 18 15 12 9 6"}/></svg>
                    {viewId === rec.id ? 'Hide Converted' : 'View Converted Data'}
                  </button>
                  {rec.raw_source_payload && (
                    <button onClick={() => setViewRawId(viewRawId === rec.id ? null : rec.id)}
                      className="text-xs font-medium flex items-center gap-1" style={{ color: '#fbbf24' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points={viewRawId === rec.id ? "6 9 12 15 18 9" : "9 18 15 12 9 6"}/></svg>
                      {viewRawId === rec.id ? 'Hide Source' : 'View Source Data'}
                    </button>
                  )}
                </div>
                {viewId === rec.id && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-teal)' }}>Converted ({FORMAT_LABELS[org.data_format]}):</p>
                    <pre className="p-3 rounded-lg text-xs overflow-auto whitespace-pre-wrap" style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', maxHeight: '300px' }}>
                      {JSON.stringify(rec.data_payload, null, 2)}
                    </pre>
                  </div>
                )}
                {viewRawId === rec.id && rec.raw_source_payload && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold mb-1" style={{ color: '#fbbf24' }}>Original Source (FHIR R4 from WAH):</p>
                    <pre className="p-3 rounded-lg text-xs overflow-auto whitespace-pre-wrap" style={{ background: 'var(--color-bg-primary)', border: '1px solid rgba(245,158,11,0.2)', maxHeight: '300px' }}>
                      {JSON.stringify(rec.raw_source_payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      </main>
    </div>
  );
}
