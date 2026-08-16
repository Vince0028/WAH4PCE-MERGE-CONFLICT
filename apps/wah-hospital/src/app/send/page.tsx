'use client';
import { useState, useEffect } from 'react';
import WAHSidebar from '@/components/Sidebar';

async function safeFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { success: false, data: [] }; }
}

interface WAHRecord {
  id: string; patient_name: string; philhealth_no: string; gender: string;
  birth_date: string; diagnosis_code: string; diagnosis_display: string;
  status: string; source: string; created_at: string;
  fhir_bundle: Record<string, unknown>;
  consent_signed: boolean;
  rejection_reason: string | null;
}

export default function SendPage() {
  const [records, setRecords] = useState<WAHRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string|null>(null);
  const [revertingId, setRevertingId] = useState<string|null>(null);
  const [viewId, setViewId] = useState<string|null>(null);
  const [toast, setToast] = useState<{type:'success'|'error', msg:string}|null>(null);
  const [deleteModal, setDeleteModal] = useState<string|null>(null);
  const [deleting, setDeleting] = useState(false);

  const showToast = (type: 'success'|'error', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 4000); };

  const fetchQueue = async () => {
    const [queuedRes, rejectedRes] = await Promise.all([
      safeFetch('/api/patients?status=QUEUED'),
      safeFetch('/api/patients?status=REJECTED'),
    ]);
    const all = [...(queuedRes.data || []), ...(rejectedRes.data || [])];
    all.sort((a: WAHRecord, b: WAHRecord) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setRecords(all);
    setLoading(false);
  };

  useEffect(() => { fetchQueue(); }, []);

  const handleSend = async (patientId: string) => {
    setSendingId(patientId);
    try {
      const data = await safeFetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          destination_org_name: 'iHOMIS',
          destination_format: 'HL7V2',
        }),
      });
      if (data.success) { showToast('success', data.message); fetchQueue(); }
      else { showToast('error', data.message || 'Rejected by iPaaS'); fetchQueue(); }
    } catch { showToast('error', 'Failed to connect to iPaaS'); }
    finally { setSendingId(null); }
  };

  const handleRequeue = async (id: string) => {
    try {
      const data = await safeFetch('/api/patients', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'QUEUED', rejection_reason: null }),
      });
      if (data.success) { showToast('success', 'Re-queued for sending'); fetchQueue(); }
      else showToast('error', data.message || 'Failed');
    } catch { showToast('error', 'Failed'); }
  };

  const handleRevert = async (id: string) => {
    setRevertingId(id);
    try {
      const data = await safeFetch('/api/patients', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'SAVED' }),
      });
      if (data.success) { showToast('success', 'Reverted to Records'); fetchQueue(); }
      else showToast('error', data.message || 'Failed');
    } catch { showToast('error', 'Failed'); }
    finally { setRevertingId(null); }
  };

  const handleDelete = async () => {
    if (!deleteModal) return;
    setDeleting(true);
    try {
      const data = await safeFetch(`/api/patients?id=${deleteModal}`, { method: 'DELETE' });
      if (data.success) { showToast('success', 'Record deleted'); fetchQueue(); }
      else showToast('error', data.message || 'Failed'); }
    catch { showToast('error', 'Failed'); }
    finally { setDeleting(false); setDeleteModal(null); }
  };

  return (
    <>
      <WAHSidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="mb-5">
          <h1 className="text-lg font-semibold">Send to iHOMIS</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Send patient records to iHOMIS. FHIR R4 → HL7 v2 conversion via AI.
          </p>
        </div>

        {/* Destination Info */}
        <div className="wah-card p-4 mb-5">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-xs font-medium uppercase tracking-wide block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Destination</label>
              <p className="text-sm font-medium">iHOMIS (IHOMIS-001)</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Target format</p>
              <span className="text-xs font-bold px-2.5 py-1 rounded" style={{ background: 'rgba(59,130,246,0.08)', color: '#3b82f6' }}>
                HL7 v2
              </span>
              <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>FHIR R4 → HL7 v2</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48"><div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-accent-bright)' }} /></div>
        ) : records.length === 0 ? (
          <div className="wah-card p-10 text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1" className="mx-auto mb-3"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>No records in send queue</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Go to Records and click &quot;Move to Send Queue&quot; on a record.</p>
          </div>
        ) : (
          <div className="space-y-3" style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto', paddingRight: '4px' }}>
            {records.map(rec => {
              const isRejected = rec.status === 'REJECTED';
              return (
              <div key={rec.id} className="wah-card p-4" style={isRejected ? { borderColor: 'rgba(220,38,38,0.3)' } : {}}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium">{rec.patient_name}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{rec.birth_date || 'N/A'} · {rec.gender} · PhilHealth: {rec.philhealth_no}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: 'rgba(139,92,246,0.08)', color: '#8b5cf6' }}>FHIR R4</span>
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>→</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.08)', color: '#3b82f6' }}>HL7 v2</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded" style={{
                      background: isRejected ? 'rgba(220,38,38,0.08)' : 'rgba(245,158,11,0.08)',
                      color: isRejected ? '#dc2626' : '#f59e0b',
                    }}>{rec.status}</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded" style={{
                      background: rec.consent_signed ? 'rgba(5,150,105,0.08)' : 'rgba(220,38,38,0.08)',
                      color: rec.consent_signed ? '#059669' : '#dc2626',
                    }}>
                      {rec.consent_signed ? '✓ Consent' : '⚠ No Consent'}
                    </span>
                  </div>
                </div>

                {isRejected && rec.rejection_reason && (
                  <div className="flex items-start gap-2 mb-3 px-3 py-2.5 rounded-md text-xs" style={{ background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.15)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" className="flex-shrink-0 mt-0.5">
                      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    <div>
                      <p className="font-semibold" style={{ color: '#dc2626' }}>Rejected by iPaaS</p>
                      <p className="mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{rec.rejection_reason}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3">
                  <div><span style={{ color: 'var(--color-text-muted)' }}>Dx:</span> <strong>{rec.diagnosis_code || 'N/A'}</strong></div>
                  <div><span style={{ color: 'var(--color-text-muted)' }}>Desc:</span> <strong>{rec.diagnosis_display || 'N/A'}</strong></div>
                  <div><span style={{ color: 'var(--color-text-muted)' }}>Resources:</span> <strong>{((rec.fhir_bundle as Record<string, unknown>)?.entry as unknown[] || []).length}</strong></div>
                  <div><span style={{ color: 'var(--color-text-muted)' }}>Created:</span> <strong>{new Date(rec.created_at).toLocaleDateString()}</strong></div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {isRejected ? (
                    <>
                      <button onClick={() => handleRequeue(rec.id)} className="wah-btn wah-btn-primary text-xs px-3 py-1.5">
                        ↻ Re-queue
                      </button>
                      <button onClick={() => handleRevert(rec.id)} disabled={revertingId === rec.id} className="wah-btn wah-btn-secondary text-xs px-3 py-1.5">
                        {revertingId === rec.id ? 'Reverting...' : 'Revert to Records'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => handleSend(rec.id)} disabled={sendingId === rec.id} className="wah-btn wah-btn-primary text-xs px-3 py-1.5">
                        {sendingId === rec.id ? (<><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" /> Sending...</>) : 'Send to iHOMIS'}
                      </button>
                      <button onClick={() => handleRevert(rec.id)} disabled={revertingId === rec.id} className="wah-btn wah-btn-secondary text-xs px-3 py-1.5">
                        {revertingId === rec.id ? 'Reverting...' : 'Revert to Records'}
                      </button>
                    </>
                  )}
                  <button onClick={() => setDeleteModal(rec.id)} className="wah-btn text-xs px-3 py-1.5" style={{ color: 'var(--color-error)', border: '1px solid rgba(220,38,38,0.2)' }}>Delete</button>
                  <button onClick={() => setViewId(viewId === rec.id ? null : rec.id)} className="text-xs font-medium flex items-center gap-1 ml-auto" style={{ color: 'var(--color-accent-bright)' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points={viewId === rec.id ? "6 9 12 15 18 9" : "9 18 15 12 9 6"}/></svg>
                    {viewId === rec.id ? 'Hide FHIR' : 'View FHIR'}
                  </button>
                </div>
                {viewId === rec.id && (
                  <pre className="mt-3 p-3 rounded text-xs overflow-auto whitespace-pre-wrap" style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', maxHeight: '400px' }}>
                    {JSON.stringify(rec.fhir_bundle, null, 2)}
                  </pre>
                )}
              </div>
              );
            })}
          </div>
        )}

        {deleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="rounded-lg p-6 w-full max-w-sm shadow-xl" style={{ background: 'var(--color-bg-secondary)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(220,38,38,0.1)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </div>
                <div><p className="font-semibold text-sm">Delete Record</p><p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>This action cannot be undone.</p></div>
              </div>
              <p className="text-sm mb-5" style={{ color: 'var(--color-text-secondary)' }}>Permanently delete this queued record?</p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setDeleteModal(null)} className="wah-btn wah-btn-secondary text-xs px-4 py-2">Cancel</button>
                <button onClick={handleDelete} disabled={deleting} className="text-xs px-4 py-2 rounded font-medium text-white" style={{ background: '#dc2626' }}>{deleting ? 'Deleting...' : 'Delete'}</button>
              </div>
            </div>
          </div>
        )}
        {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      </main>
    </>
  );
}
