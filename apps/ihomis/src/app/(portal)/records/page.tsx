'use client';
import { useState, useEffect } from 'react';

async function safeFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { success: false, data: [] }; }
}

interface PatientRecord {
  id: string; patient_name: string; philhealth_no: string; sex: string;
  dob: string; diagnosis_code: string; diagnosis_desc: string;
  priority: string; status: string; source: string;
  hl7v2_payload: Record<string, unknown>;
  created_at: string;
  consent_signed: boolean;
}

export default function RecordsPage() {
  const [records, setRecords] = useState<PatientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{type:'success'|'error', msg:string}|null>(null);
  const [viewId, setViewId] = useState<string|null>(null);
  const [deleteModal, setDeleteModal] = useState<string|null>(null);
  const [deleting, setDeleting] = useState(false);

  const showToast = (type: 'success'|'error', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 4000); };

  useEffect(() => { fetchRecords(); }, []);

  const fetchRecords = async () => {
    const data = await safeFetch('/api/patients?status=SAVED');
    setRecords(data.data || []);
    setLoading(false);
  };

  const handleQueue = async (id: string) => {
    const data = await safeFetch('/api/patients', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'QUEUED' }),
    });
    if (data.success) { showToast('success', 'Moved to send queue'); fetchRecords(); }
    else showToast('error', data.message || 'Failed');
  };

  const handleDelete = async () => {
    if (!deleteModal) return;
    setDeleting(true);
    try {
      const data = await safeFetch(`/api/patients?id=${deleteModal}`, { method: 'DELETE' });
      if (data.success) { showToast('success', 'Record deleted'); fetchRecords(); }
      else showToast('error', data.message || 'Failed');
    } catch { showToast('error', 'Failed'); }
    finally { setDeleting(false); setDeleteModal(null); }
  };

  return (
    <>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Patient Records</h1>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Saved records for iHOMIS. Move records to send queue for exchange.</p>
          </div>
          <button onClick={() => { setLoading(true); fetchRecords(); }} className="portal-btn portal-btn-secondary text-xs flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-accent)' }} />
          </div>
        ) : records.length === 0 ? (
          <div className="portal-card p-10 text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1" className="mx-auto mb-3"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>No saved records</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Create a new patient record to get started.</p>
            <a href="/save" className="portal-btn portal-btn-primary text-xs mt-4 inline-flex">New Patient Record</a>
          </div>
        ) : (
          <div className="space-y-3" style={{ maxHeight: 'calc(100vh - 180px)', overflowY: 'auto', paddingRight: '4px' }}>
            {records.map(rec => (
              <div key={rec.id} className="portal-card p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold">{rec.patient_name}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{rec.dob || 'N/A'} · {rec.sex} · PhilHealth: {rec.philhealth_no}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="status-badge" style={{ background: 'rgba(124,58,237,0.1)', color: '#a78bfa' }}>SAVED</span>
                    <span className="status-badge" style={{
                      background: rec.consent_signed ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                      color: rec.consent_signed ? '#34d399' : '#f87171',
                    }}>
                      {rec.consent_signed ? 'Consent Signed' : 'Missing Consent'}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3">
                  <div><span style={{ color: 'var(--color-text-muted)' }}>Dx:</span> <strong>{rec.diagnosis_code || 'N/A'}</strong></div>
                  <div><span style={{ color: 'var(--color-text-muted)' }}>Desc:</span> <strong>{rec.diagnosis_desc || 'N/A'}</strong></div>
                  <div><span style={{ color: 'var(--color-text-muted)' }}>Priority:</span> <strong>{rec.priority || 'N/A'}</strong></div>
                  <div><span style={{ color: 'var(--color-text-muted)' }}>Created:</span> <strong>{new Date(rec.created_at).toLocaleDateString()}</strong></div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => handleQueue(rec.id)} className="portal-btn portal-btn-primary text-xs px-3 py-1.5">
                    Move to Send Queue
                  </button>
                  <button onClick={() => setDeleteModal(rec.id)} className="portal-btn portal-btn-danger text-xs px-3 py-1.5">Delete</button>
                  <button onClick={() => setViewId(viewId === rec.id ? null : rec.id)}
                    className="text-xs font-medium flex items-center gap-1 ml-auto" style={{ color: 'var(--color-accent-bright)' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points={viewId === rec.id ? "6 9 12 15 18 9" : "9 18 15 12 9 6"}/></svg>
                    {viewId === rec.id ? 'Hide JSON' : 'View JSON'}
                  </button>
                </div>
                {viewId === rec.id && (
                  <pre className="mt-3 p-3 rounded-lg text-xs overflow-auto whitespace-pre-wrap" style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', maxHeight: '400px' }}>
                    {JSON.stringify(rec.hl7v2_payload, null, 2)}
                  </pre>
                )}
              </div>
            ))}
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
