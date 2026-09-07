'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';

async function safeFetch(url: string) {
  const res = await fetch(url);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { success: false }; }
}

interface Metrics {
  total_records: number; success_count: number; pending_count: number;
  quarantined_count: number; transforming_count: number; success_rate: number;
  org_to_wah: number; wah_to_org: number;
  hl7v2_count: number; fhir_count: number;
}

interface Transaction {
  id: string; source_system: string; destination_system: string;
  source_format: string; destination_format: string;
  status: string; created_at: string;
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [recentTx, setRecentTx] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const [metricsData, txData] = await Promise.all([
      safeFetch('/api/metrics'), safeFetch('/api/transactions?limit=50'),
    ]);
    if (metricsData.success) setMetrics(metricsData.metrics);
    if (txData.success) setRecentTx(txData.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 10000); return () => clearInterval(i); }, []);

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

  return (
    <>
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="mb-6">
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Real-time monitoring of multi-format health data transformations</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-accent-bright)' }} />
          </div>
        ) : (
          <>
            {/* Main Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Total Records', value: metrics?.total_records || 0, color: '#8b5cf6', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 12a9 9 0 11-6.22-8.56"/></svg> },
                { label: 'Success Rate', value: `${metrics?.success_rate || 0}%`, color: '#059669', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="20 6 9 17 4 12"/></svg> },
                { label: 'Pending', value: (metrics?.pending_count || 0) + (metrics?.transforming_count || 0), color: '#d97706', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
                { label: 'Quarantined', value: metrics?.quarantined_count || 0, color: '#dc2626', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
              ].map(m => (
                <div key={m.label} className="ipaas-card p-5" style={{ borderLeft: `3px solid ${m.color}` }}>
                  <div className="flex items-center gap-2 mb-2" style={{ color: m.color }}>{m.icon}<span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{m.label}</span></div>
                  <p className="text-2xl font-bold">{m.value}</p>
                </div>
              ))}
            </div>

            {/* Direction + Format Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {/* Direction Cards */}
              <div className="ipaas-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: 'rgba(37,99,235,0.08)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </div>
                  <div><p className="text-sm font-medium">Org → WAH</p><p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>HL7v2 → FHIR R4</p></div>
                </div>
                <p className="text-3xl font-bold" style={{ color: '#2563eb' }}>{metrics?.org_to_wah || 0}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>records transformed</p>
              </div>
              <div className="ipaas-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.08)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="1.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                  </div>
                  <div><p className="text-sm font-medium">WAH → Org</p><p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>FHIR R4 → HL7v2</p></div>
                </div>
                <p className="text-3xl font-bold" style={{ color: '#8b5cf6' }}>{metrics?.wah_to_org || 0}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>records transformed</p>
              </div>
            </div>

            {/* Format Breakdown */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {[
                { label: 'HL7 v2.x', count: metrics?.hl7v2_count || 0, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
                { label: 'FHIR R4', count: metrics?.fhir_count || 0, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
              ].map(f => (
                <div key={f.label} className="ipaas-card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: f.bg, color: f.color }}>{f.label}</span>
                  </div>
                  <p className="text-xl font-bold" style={{ color: f.color }}>{f.count}</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>transformations</p>
                </div>
              ))}
            </div>

            {/* Recent Activity */}
            <div className="ipaas-card overflow-hidden">
              <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <h2 className="text-sm font-semibold">Recent Activity</h2>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>All transactions ({recentTx.length})</p>
              </div>
              {recentTx.length === 0 ? (
                <div className="p-10 text-center">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1" className="mx-auto mb-3"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No transactions yet. Send data from an organization or WAH.</p>
                </div>
              ) : (
              <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                <table className="data-table">
                  <thead><tr><th>Transaction ID</th><th>Direction</th><th>Formats</th><th>Status</th><th>Date</th></tr></thead>
                  <tbody>
                    {recentTx.map(tx => {
                      const st = statusStyle(tx.status);
                      const srcFmt = formatBadgeStyle(tx.source_format);
                      const dstFmt = formatBadgeStyle(tx.destination_format);
                      return (
                        <tr key={tx.id} onClick={() => window.location.href = `/mapper?id=${tx.id}`} style={{ cursor: 'pointer' }}>
                          <td className="font-mono text-xs" style={{ color: 'var(--color-accent-bright)' }}>{tx.id.slice(0, 8)}...</td>
                          <td className="text-sm">{tx.source_system} → {tx.destination_system}</td>
                          <td>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded mr-1" style={{ background: srcFmt.bg, color: srcFmt.color }}>{formatLabel(tx.source_format)}</span>
                            <span style={{ color: 'var(--color-text-muted)' }}>→</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded ml-1" style={{ background: dstFmt.bg, color: dstFmt.color }}>{formatLabel(tx.destination_format)}</span>
                          </td>
                          <td><span className="ipaas-badge" style={{ background: st.bg, color: st.color }}>{tx.status}</span></td>
                          <td className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{new Date(tx.created_at).toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}
