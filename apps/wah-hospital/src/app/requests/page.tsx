'use client';
import { useState, useEffect } from 'react';
import WAHSidebar from '@/components/Sidebar';

async function safeFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { success: false, data: [] }; }
}

interface DataRequest {
  id: string;
  requesting_org: string;
  requesting_org_id: string;
  destination_format: string;
  philhealth_no: string | null;
  patient_name: string | null;
  ipaas_transaction_id: string | null;
  status: string;
  created_at: string;
}

export default function RequestsPage() {
  const [requests, setRequests] = useState<DataRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{type:'success'|'error', msg:string}|null>(null);

  const showToast = (type: 'success'|'error', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 4000); };

  const fetchRequests = async () => {
    const data = await safeFetch('/api/requests');
    if (data.success) {
      const sorted = (data.data || []).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setRequests(sorted);
    }
    setLoading(false);
  };

  useEffect(() => { fetchRequests(); const i = setInterval(fetchRequests, 5000); return () => clearInterval(i); }, []);

  const handleApprove = async (req: DataRequest) => {
    setProcessingId(req.id);
    try {
      // 1. Search for the patient in WAH
      const searchParam = req.philhealth_no
        ? `philhealth_no=${encodeURIComponent(req.philhealth_no)}`
        : `name=${encodeURIComponent(req.patient_name || '')}`;
      
      const searchRes = await safeFetch(`/api/patients/search?${searchParam}`);
      if (!searchRes.success || !searchRes.data) {
        showToast('error', 'Patient not found in WAH database.');
        setProcessingId(null);
        return;
      }

      const patientData = searchRes.data;
      const fhirData = patientData.fhir_bundle || patientData;

      // 2. Send to iPaaS for ingestion
      const ipaasRes = await fetch(`${process.env.NEXT_PUBLIC_IPAAS_API_URL || 'http://localhost:3000/api'}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_system: 'WAH',
          destination_system: req.requesting_org,
          source_format: 'FHIR_R4',
          destination_format: req.destination_format,
          payload: fhirData,
          original_json: patientData,
          consent_signed: true,
          request_id: req.id,
          ipaas_transaction_id: req.ipaas_transaction_id,
        }),
      });

      const ipaasData = await ipaasRes.json();
      if (ipaasData.success) {
        // 3. Update local request status
        await safeFetch('/api/requests', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: req.id, status: 'APPROVED' })
        });
        showToast('success', 'Request approved and data sent.');
        fetchRequests();
      } else {
        showToast('error', ipaasData.message || 'iPaaS rejected the data');
      }
    } catch (error) {
      showToast('error', 'Failed to process approval');
    }
    setProcessingId(null);
  };

  const handleDecline = async (req: DataRequest) => {
    setProcessingId(req.id);
    
    // 1. Update local request status
    await safeFetch('/api/requests', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: req.id, status: 'DECLINED' })
    });

    // 2. Notify Portal via iPaaS
    try {
      await fetch(`${process.env.NEXT_PUBLIC_IPAAS_API_URL || 'http://localhost:3000/api'}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: req.id,
          destination_system: req.requesting_org,
          ipaas_transaction_id: req.ipaas_transaction_id,
          message: 'Request declined by WAH Hospital.',
        }),
      });
    } catch (e) {
      console.error('Failed to notify iPaaS of decline', e);
    }

    showToast('success', 'Request declined.');
    fetchRequests();
    setProcessingId(null);
  };

  return (
    <>
      <WAHSidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Data Requests</h1>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Incoming requests from other organizations requiring your approval</p>
          </div>
          <button onClick={() => { setLoading(true); fetchRequests(); }} className="wah-btn wah-btn-secondary text-xs">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-accent-bright)' }} />
          </div>
        ) : requests.length === 0 ? (
          <div className="wah-card p-10 text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1" className="mx-auto mb-3"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>No pending requests</p>
          </div>
        ) : (
          <div className="space-y-3" style={{ maxHeight: 'calc(100vh - 180px)', overflowY: 'auto', paddingRight: '4px' }}>
            {requests.map(req => {
              const isPending = req.status === 'PENDING';
              return (
                <div key={req.id} className="wah-card p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-medium">Request from {req.requesting_org}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{new Date(req.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ 
                        background: isPending ? 'rgba(245,158,11,0.1)' : req.status === 'APPROVED' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', 
                        color: isPending ? '#fbbf24' : req.status === 'APPROVED' ? '#34d399' : '#f87171' 
                      }}>
                        {req.status}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                    <div><span style={{ color: 'var(--color-text-muted)' }}>Target PhilHealth:</span> <strong>{req.philhealth_no || 'N/A'}</strong></div>
                    <div style={{ textAlign: 'right' }}><span style={{ color: 'var(--color-text-muted)' }}>Target Name:</span> <strong>{req.patient_name || 'N/A'}</strong></div>
                  </div>

                  {isPending && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleApprove(req)} disabled={processingId === req.id}
                        className="wah-btn wah-btn-primary text-xs px-4 py-1.5 flex items-center gap-1">
                        {processingId === req.id ? 'Processing...' : (
                          <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg> Approve & Send</>
                        )}
                      </button>
                      <button onClick={() => handleDecline(req)} disabled={processingId === req.id}
                        className="wah-btn text-xs px-4 py-1.5" style={{ color: 'var(--color-error)', border: '1px solid rgba(220,38,38,0.2)' }}>
                        Decline
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      </main>
    </>
  );
}
