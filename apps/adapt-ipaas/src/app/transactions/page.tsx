'use client';
import { useEffect, useState, useMemo } from 'react';
import Sidebar from '@/components/Sidebar';
import { calculateMappingPercentage, calculateSourceFillCount } from '@/lib/mapping-calc';

async function safeFetch(url: string) {
  const res = await fetch(url);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { success: false, data: [], total: 0 }; }
}

interface Transaction {
  id: string; source_system: string; destination_system: string;
  source_format: string; destination_format: string;
  status: string; error_message: string | null; created_at: string;
  raw_payload?: Record<string, unknown> | null;
  transformed_payload?: Record<string, unknown> | null;
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [page, setPage] = useState(0);
  const limit = 15;

  const fetchTransactions = async () => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
    if (statusFilter) params.set('status', statusFilter);
    if (sourceFilter) params.set('source', sourceFilter);
    const data = await safeFetch(`/api/transactions?${params.toString()}`);
    if (data.success) { setTransactions(data.data || []); setTotal(data.total || 0); }
    setLoading(false);
  };

  useEffect(() => { setLoading(true); fetchTransactions(); }, [statusFilter, sourceFilter, page]);
  useEffect(() => { const i = setInterval(fetchTransactions, 15000); return () => clearInterval(i); }, [statusFilter, sourceFilter, page]);

  const totalPages = Math.ceil(total / limit);

  const statusStyle = (s: string) => {
    const m: Record<string, { bg: string; color: string }> = {
      SUCCESS: { bg: 'rgba(5,150,105,0.08)', color: '#059669' },
      PENDING: { bg: 'rgba(217,119,6,0.08)', color: '#d97706' },
      TRANSFORMING: { bg: 'rgba(37,99,235,0.08)', color: '#2563eb' },
      QUARANTINED: { bg: 'rgba(220,38,38,0.08)', color: '#dc2626' },
    };
    return m[s] || m.PENDING;
  };

  const formatBadgeStyle = (fmt: string) => {
    const m: Record<string, { bg: string; color: string }> = {
      HL7V2: { bg: 'rgba(59,130,246,0.08)', color: '#3b82f6' },
      FHIR_R4: { bg: 'rgba(16,185,129,0.08)', color: '#10b981' },
    };
    return m[fmt] || m.HL7V2;
  };

  const formatLabel = (fmt: string) => {
    const m: Record<string, string> = { HL7V2: 'HL7v2', FHIR_R4: 'FHIR R4' };
    return m[fmt] || fmt;
  };

  const pctColor = (pct: number) => {
    if (pct >= 85) return '#059669'; // green
    if (pct >= 60) return '#d97706'; // amber
    return '#dc2626'; // red
  };

  const txMappings = useMemo(() => {
    const map: Record<string, { src: number; dest: number; srcFilled: number; srcTotal: number; destFilled: number; destTotal: number }> = {};
    for (const tx of transactions) {
      if (tx.status !== 'SUCCESS') {
        map[tx.id] = { src: 0, dest: 0, srcFilled: 0, srcTotal: 0, destFilled: 0, destTotal: 0 };
        continue;
      }
      const srcResult = calculateSourceFillCount(tx.raw_payload || null, tx.source_system);
      const destResult = calculateMappingPercentage(tx.transformed_payload || null, tx.destination_system);
      map[tx.id] = {
        src: srcResult.percentage,
        dest: destResult.percentage,
        srcFilled: srcResult.filledFields,
        srcTotal: srcResult.totalFields,
        destFilled: destResult.filledFields,
        destTotal: destResult.totalFields,
      };
    }
    return map;
  }, [transactions]);

  return (
    <>
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="mb-5">
          <h1 className="text-lg font-semibold">Transaction Logs</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Complete audit trail of all data transformations — {total} total records</p>
        </div>

        <div className="flex gap-3 mb-5 flex-wrap">
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 rounded-md text-xs outline-none" style={{ background: '#fff', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
            <option value="">All Statuses</option>
            <option value="SUCCESS">Success</option>
            <option value="PENDING">Pending</option>
            <option value="TRANSFORMING">Transforming</option>
            <option value="QUARANTINED">Quarantined</option>
          </select>
          <select value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 rounded-md text-xs outline-none" style={{ background: '#fff', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
            <option value="">All Sources</option>
            <option value="iHOMIS">iHOMIS (DOH)</option>
            <option value="WAH">WAH Hospital</option>
          </select>
          <button onClick={() => { setLoading(true); fetchTransactions(); }} className="ipaas-btn ipaas-btn-secondary text-xs">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
            Refresh
          </button>
        </div>

        <div className="ipaas-card overflow-hidden mb-5">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-accent-bright)' }} />
            </div>
          ) : transactions.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No transactions found matching your filters.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Transaction ID</th><th>Direction</th><th>Formats</th><th>Sent</th><th>Received</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {transactions.map(tx => {
                  const st = statusStyle(tx.status);
                  const srcFmt = formatBadgeStyle(tx.source_format);
                  const dstFmt = formatBadgeStyle(tx.destination_format);
                  const mapping = txMappings[tx.id];
                  const hasMappingData = tx.status === 'SUCCESS' && mapping && mapping.destTotal > 0;
                  
                  return (
                    <tr key={tx.id} onClick={() => window.location.href = `/mapper?id=${tx.id}`} style={{ cursor: 'pointer' }}>
                      <td className="font-mono text-xs" style={{ color: 'var(--color-accent-bright)' }}>{tx.id.slice(0, 8)}...</td>
                      <td className="text-sm">{tx.source_system} → {tx.destination_system}</td>
                      <td>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded mr-1" style={{ background: srcFmt.bg, color: srcFmt.color }}>{formatLabel(tx.source_format)}</span>
                        <span style={{ color: 'var(--color-text-muted)' }}>→</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded ml-1" style={{ background: dstFmt.bg, color: dstFmt.color }}>{formatLabel(tx.destination_format)}</span>
                      </td>
                      {/* Source mapping % */}
                      <td>
                        {hasMappingData ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-14 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.06)' }}>
                              <div className="h-full rounded-full transition-all" style={{ width: `${mapping.src}%`, background: pctColor(mapping.src) }} />
                            </div>
                            <span className="text-[10px] font-bold" style={{ color: pctColor(mapping.src) }}>{mapping.src}%</span>
                            <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>{mapping.srcFilled}/{mapping.srcTotal}</span>
                          </div>
                        ) : (
                          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>—</span>
                        )}
                      </td>
                      {/* Destination mapping % */}
                      <td>
                        {hasMappingData ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-14 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.06)' }}>
                              <div className="h-full rounded-full transition-all" style={{ width: `${mapping.dest}%`, background: pctColor(mapping.dest) }} />
                            </div>
                            <span className="text-[10px] font-bold" style={{ color: pctColor(mapping.dest) }}>{mapping.dest}%</span>
                            <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>{mapping.destFilled}/{mapping.destTotal}</span>
                          </div>
                        ) : (
                          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>—</span>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-col gap-1">
                          <span className="ipaas-badge self-start" style={{ background: st.bg, color: st.color }}>{tx.status}</span>
                          {tx.error_message && (
                            <span className="text-[10px] max-w-[120px] truncate" style={{ color: '#dc2626' }} title={tx.error_message}>
                              {tx.error_message}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{new Date(tx.created_at).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Page {page + 1} of {totalPages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                className="ipaas-btn ipaas-btn-secondary text-xs disabled:opacity-30">Previous</button>
              <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
                className="ipaas-btn ipaas-btn-secondary text-xs disabled:opacity-30">Next</button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
