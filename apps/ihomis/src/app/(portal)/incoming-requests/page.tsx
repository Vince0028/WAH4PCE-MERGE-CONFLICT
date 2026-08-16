'use client';
import { useState, useEffect } from 'react';

async function safeFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { success: false, data: [] }; }
}

const IPAAS_URL = process.env.NEXT_PUBLIC_IPAAS_API_URL || 'http://localhost:3000/api';

interface IncomingRequest {
  id: string;
  requesting_system: string;
  philhealth_no: string | null;
  patient_name: string | null;
  request_reason: string | null;
  ipaas_transaction_id: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

export default function IncomingRequestsPage() {
  const [requests, setRequests] = useState<IncomingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{type:'success'|'error', msg:string}|null>(null);

  const showToast = (type: 'success'|'error', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 4000); };

  // Note: Since we simplified the backend, incoming requests are handled
  // automatically by the /api/incoming-requests endpoint. This page is
  // for visibility — showing what WAH has requested from iHOMIS.
  useEffect(() => { setLoading(false); }, []);

  const handleApprove = async (req: IncomingRequest) => {
    setProcessingId(req.id);

    try {
      // Search for patient data in iHOMIS records
      const searchRes = await safeFetch('/api/patients');
      const allRecords = searchRes.data || [];

      // Find matching patient by PhilHealth or name
      let matchedPatient = null;
      for (const rec of allRecords) {
        if (req.philhealth_no && rec.philhealth_no === req.philhealth_no) { matchedPatient = rec; break; }
        if (req.patient_name && rec.patient_name?.toLowerCase().includes(req.patient_name.toLowerCase())) { matchedPatient = rec; break; }
      }

      if (!matchedPatient) {
        showToast('error', 'Patient not found in iHOMIS records.');
        setProcessingId(null);
        return;
      }

      // Send data to iPaaS for transformation and delivery to WAH
      const ipaasRes = await fetch(`${IPAAS_URL}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_system: 'iHOMIS',
          destination_system: 'WAH',
          source_format: 'HL7V2',
          destination_format: 'FHIR_R4',
          payload: matchedPatient.hl7v2_payload || matchedPatient,
          original_json: matchedPatient.hl7v2_payload || matchedPatient,
          consent_signed: matchedPatient.consent_signed ?? true,
          request_id: req.id,
          ipaas_transaction_id: req.ipaas_transaction_id,
        }),
      });

      const ipaasData = await ipaasRes.json();
      if (ipaasData.success) {
        showToast('success', 'Request approved and data sent to WAH.');
      } else {
        showToast('error', ipaasData.message || 'iPaaS rejected the data.');
      }
    } catch {
      showToast('error', 'Failed to process approval');
    }
    setProcessingId(null);
  };

  const handleDecline = async (req: IncomingRequest) => {
    setProcessingId(req.id);

    // Notify iPaaS of decline
    try {
      await fetch(`${IPAAS_URL}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: req.id,
          destination_system: 'WAH',
          ipaas_transaction_id: req.ipaas_transaction_id,
          message: 'Request declined by iHOMIS.',
        }),
      });
    } catch (e) {
      console.error('Failed to notify iPaaS of decline', e);
    }

    showToast('success', 'Request declined.');
    setProcessingId(null);
  };

  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Incoming Requests</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Data requests from WAH Hospital asking for iHOMIS patient records. You can approve or decline each request.
          </p>
        </div>
        <button onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 500); }} className="portal-btn portal-btn-secondary text-xs flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-accent-bright)' }} />
        </div>
      ) : requests.length === 0 ? (
        <div className="portal-card p-10 text-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1" className="mx-auto mb-3"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>
          <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>No incoming requests</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>When WAH Hospital requests your patient data, it will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', paddingRight: '4px' }}>
          {requests.map(req => {
            const isPending = req.status === 'PENDING';
            const statusColors: Record<string, { bg: string; color: string }> = {
              PENDING: { bg: 'rgba(245,158,11,0.1)', color: '#fbbf24' },
              COMPLETED: { bg: 'rgba(16,185,129,0.1)', color: '#34d399' },
              DENIED: { bg: 'rgba(239,68,68,0.1)', color: '#f87171' },
              FAILED: { bg: 'rgba(239,68,68,0.1)', color: '#f87171' },
            };
            const st = statusColors[req.status] || statusColors.PENDING;

            return (
              <div key={req.id} className="portal-card p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-medium">Request from {req.requesting_system}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{new Date(req.created_at).toLocaleString()}</p>
                  </div>
                  <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: st.bg, color: st.color }}>
                    {req.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <div><span style={{ color: 'var(--color-text-muted)' }}>PhilHealth:</span> <strong>{req.philhealth_no || 'N/A'}</strong></div>
                  <div style={{ textAlign: 'right' }}><span style={{ color: 'var(--color-text-muted)' }}>Patient:</span> <strong>{req.patient_name || 'N/A'}</strong></div>
                </div>

                {req.request_reason && (
                  <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
                    <span className="font-medium">Reason:</span> {req.request_reason}
                  </p>
                )}

                {req.error_message && (
                  <p className="text-xs mb-3" style={{ color: '#f87171' }}>
                    {req.error_message}
                  </p>
                )}

                {isPending && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleApprove(req)} disabled={processingId === req.id}
                      className="portal-btn portal-btn-primary text-xs px-4 py-1.5 flex items-center gap-1">
                      {processingId === req.id ? 'Processing...' : (
                        <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg> Approve & Send Data</>
                      )}
                    </button>
                    <button onClick={() => handleDecline(req)} disabled={processingId === req.id}
                      className="portal-btn text-xs px-4 py-1.5" style={{ color: 'var(--color-error)', border: '1px solid rgba(220,38,38,0.2)' }}>
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
    </>
  );
}
