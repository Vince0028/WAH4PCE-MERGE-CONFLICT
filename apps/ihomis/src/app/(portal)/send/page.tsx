'use client';
import { useState, useEffect } from 'react';
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
  created_at: string;
  consent_signed: boolean;
  rejection_reason: string | null;
}

export default function SendPage() {
  const router = useRouter();
  const [org, setOrg] = useState<OrgProfile | null>(null);
  const [records, setRecords] = useState<PatientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string|null>(null);
  const [revertingId, setRevertingId] = useState<string|null>(null);
  const [viewId, setViewId] = useState<string|null>(null);
  const [toast, setToast] = useState<{type:'success'|'error', msg:string}|null>(null);
  const [deleteModal, setDeleteModal] = useState<string|null>(null);
  const [deleting, setDeleting] = useState(false);

  const showToast = (type: 'success'|'error', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 4000); };

  useEffect(() => {
    getCurrentOrg().then(o => {
      if (!o) { router.push('/login'); return; }
      setOrg(o);
      fetchQueue(o.id);
    });
  }, [router]);

  const fetchQueue = async (orgId: string) => {
    const [queuedRes, rejectedRes] = await Promise.all([
      safeFetch(`/api/patients?org_id=${orgId}&status=QUEUED`),
      safeFetch(`/api/patients?org_id=${orgId}&status=REJECTED`),
    ]);
    const all = [...(queuedRes.data || []), ...(rejectedRes.data || [])];
    all.sort((a: PatientRecord, b: PatientRecord) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setRecords(all);
    setLoading(false);
  };

  const handleSend = async (patientId: string) => {
    if (!org) return;
    setSendingId(patientId);
    try {
      const data = await safeFetch('/api/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: patientId, org_id: org.id }),
      });
      if (data.success) { showToast('success', data.message); fetchQueue(org.id); }
      else { showToast('error', data.message || 'Rejected by iPaaS'); fetchQueue(org.id); }
    } catch { showToast('error', 'Failed to connect to iPaaS'); }
    finally { setSendingId(null); }
  };

  const handleRequeue = async (id: string) => {
    const data = await safeFetch('/api/patients', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'QUEUED', rejection_reason: null }),
    });
    if (data.success) { showToast('success', 'Re-queued for sending'); if (org) fetchQueue(org.id); }
    else showToast('error', data.message || 'Failed');
  };

  const handleRevert = async (id: string) => {
    setRevertingId(id);
    const data = await safeFetch('/api/patients', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'SAVED' }),
    });
    if (data.success) { showToast('success', 'Reverted to Records'); if (org) fetchQueue(org.id); }
    else showToast('error', data.message || 'Failed');
    setRevertingId(null);
  };

  const handleDelete = async () => {
    if (!deleteModal) return;
    setDeleting(true);
    try {
      const data = await safeFetch(`/api/patients?id=${deleteModal}`, { method: 'DELETE' });
      if (data.success) { showToast('success', 'Record deleted'); if (org) fetchQueue(org.id); }
      else showToast('error', data.message || 'Failed');
    } catch { showToast('error', 'Failed'); }
    finally { setDeleting(false); setDeleteModal(null); }
  };

  const FORMAT_LABELS: Record<string, string> = { HL7V2: 'HL7 v2', FHIR_R4: 'FHIR R4', CDA_R2: 'CDA R2' };
  const FORMAT_BADGE: Record<string, string> = { HL7V2: 'format-badge format-badge-hl7v2', FHIR_R4: 'format-badge format-badge-fhir', CDA_R2: 'format-badge format-badge-cda' };

  if (!org) return null;

  return (
    <>
        <div className="mb-5">
          <h1 className="text-lg font-bold">Send to WAH</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Records queued for sending. {FORMAT_LABELS[org.data_format]} → FHIR R4 conversion via AI.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-accent)' }} />
          </div>
        ) : records.length === 0 ? (
          <div className="portal-card p-10 text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1" className="mx-auto mb-3"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>No records in send queue</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Go to Records and click &quot;Move to Send Queue&quot; on a record.</p>
          </div>
        ) : (
          <div className="space-y-3" style={{ maxHeight: 'calc(100vh - 180px)', overflowY: 'auto', paddingRight: '4px' }}>
            {records.map(rec => {
              const isRejected = rec.status === 'REJECTED';
              return (
              <div key={rec.id} className="portal-card p-4" style={isRejected ? { borderColor: 'rgba(239,68,68,0.3)' } : {}}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold">{rec.patient_name}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{rec.dob || 'N/A'} · {rec.sex} · PhilHealth: {rec.philhealth_no}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={FORMAT_BADGE[org.data_format]}>{FORMAT_LABELS[org.data_format]}</span>
                    <span className="status-badge" style={{
                      background: isRejected ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                      color: isRejected ? '#f87171' : '#fbbf24',
                    }}>{rec.status}</span>
                    <span className="status-badge" style={{
                      background: rec.consent_signed ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                      color: rec.consent_signed ? '#34d399' : '#f87171',
                    }}>
                      {rec.consent_signed ? 'Consent Signed' : 'Missing Consent'}
                    </span>
                  </div>
                </div>

                {isRejected && rec.rejection_reason && (
                  <div className="flex items-start gap-2 mb-3 px-3 py-2.5 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" className="flex-shrink-0 mt-0.5">
                      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    <div>
                      <p className="font-bold" style={{ color: '#f87171' }}>Rejected by iPaaS</p>
                      <p className="mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{rec.rejection_reason}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3">
                  <div><span style={{ color: 'var(--color-text-muted)' }}>Dx:</span> <strong>{rec.diagnosis_code || 'N/A'}</strong></div>
                  <div><span style={{ color: 'var(--color-text-muted)' }}>Desc:</span> <strong>{rec.diagnosis_desc || 'N/A'}</strong></div>
                  <div><span style={{ color: 'var(--color-text-muted)' }}>Priority:</span> <strong>{rec.priority || 'N/A'}</strong></div>
                  <div><span style={{ color: 'var(--color-text-muted)' }}>Created:</span> <strong>{new Date(rec.created_at).toLocaleDateString()}</strong></div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {isRejected ? (
                    <>
                      <button onClick={() => handleRequeue(rec.id)} className="portal-btn portal-btn-primary text-xs px-3 py-1.5">Re-queue</button>
                      <button onClick={() => handleRevert(rec.id)} disabled={revertingId === rec.id} className="portal-btn portal-btn-secondary text-xs px-3 py-1.5">
                        {revertingId === rec.id ? 'Reverting...' : 'Revert to Records'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => handleSend(rec.id)} disabled={sendingId === rec.id} className="portal-btn portal-btn-primary text-xs px-3 py-1.5">
                        {sendingId === rec.id ? (
                          <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" /> Sending...</>
                        ) : 'Send to WAH'}
                      </button>
                      <button onClick={() => handleRevert(rec.id)} disabled={revertingId === rec.id} className="portal-btn portal-btn-secondary text-xs px-3 py-1.5">
                        {revertingId === rec.id ? 'Reverting...' : 'Revert to Records'}
                      </button>
                    </>
                  )}
                  <button onClick={() => setDeleteModal(rec.id)} className="portal-btn portal-btn-danger text-xs px-3 py-1.5">Delete</button>
                  <button onClick={() => setViewId(viewId === rec.id ? null : rec.id)}
                    className="text-xs font-medium flex items-center gap-1 ml-auto" style={{ color: 'var(--color-accent-bright)' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points={viewId === rec.id ? "6 9 12 15 18 9" : "9 18 15 12 9 6"}/></svg>
                    {viewId === rec.id ? 'Hide JSON' : 'View JSON'}
                  </button>
                </div>
                {viewId === rec.id && (
                  <pre className="mt-3 p-3 rounded-lg text-xs overflow-auto whitespace-pre-wrap" style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', maxHeight: '400px' }}>
                    {JSON.stringify(rec.data_payload, null, 2)}
                  </pre>
                )}
              </div>
              );
            })}
          </div>
        )}

        {deleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div className="rounded-xl p-6 w-full max-w-sm shadow-2xl" style={{ background: 'var(--color-bg-card)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                </div>
                <div>
                  <p className="font-bold text-sm">Delete Record</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>This action cannot be undone.</p>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setDeleteModal(null)} className="portal-btn portal-btn-secondary text-xs px-4 py-2">Cancel</button>
                <button onClick={handleDelete} disabled={deleting} className="text-xs px-4 py-2 rounded-lg font-medium text-white" style={{ background: '#ef4444' }}>
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
        {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </>
  );
}
