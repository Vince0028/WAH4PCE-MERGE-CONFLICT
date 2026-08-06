'use client';
import { useEffect, useState } from 'react';
import PortalSidebar from '@/components/Sidebar';
import { getCurrentOrg, supabase, type OrgProfile } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

const FORMAT_INFO: Record<string, { label: string; desc: string; color: string; badgeClass: string }> = {
  HL7V2: { label: 'HL7 v2.x', desc: 'Pipe-delimited message segments (MSH, PID, PV1, OBX, DG1)', color: '#60a5fa', badgeClass: 'format-badge format-badge-hl7v2' },
  FHIR_R4: { label: 'PH Core FHIR R4', desc: 'JSON Transaction Bundle (Patient, Encounter, Observation, Condition)', color: '#34d399', badgeClass: 'format-badge format-badge-fhir' },
  CDA_R2: { label: 'CDA R2', desc: 'XML Clinical Document Architecture Release 2', color: '#fbbf24', badgeClass: 'format-badge format-badge-cda' },
};

export default function Dashboard() {
  const router = useRouter();
  const [org, setOrg] = useState<OrgProfile | null>(null);
  const [stats, setStats] = useState({ total: 0, sent: 0, received: 0, pending: 0 });
  const [requests, setRequests] = useState({ total: 0, completed: 0, pending: 0 });

  useEffect(() => {
    getCurrentOrg().then(o => {
      if (!o) { router.push('/login'); return; }
      setOrg(o);
      fetchStats(o.id);
    });
  }, [router]);

  const fetchStats = async (orgId: string) => {
    const { data: patients } = await supabase.from('org_patients').select('status').eq('org_id', orgId);
    if (patients) {
      setStats({
        total: patients.length,
        sent: patients.filter((p: { status: string }) => p.status === 'SENT').length,
        received: patients.filter((p: { status: string }) => p.status === 'RECEIVED').length,
        pending: patients.filter((p: { status: string }) => ['SAVED', 'QUEUED'].includes(p.status)).length,
      });
    }
    const { data: reqs } = await supabase.from('data_requests').select('status').eq('requesting_org_id', orgId);
    if (reqs) {
      setRequests({
        total: reqs.length,
        completed: reqs.filter((r: { status: string }) => r.status === 'COMPLETED').length,
        pending: reqs.filter((r: { status: string }) => ['PENDING', 'PROCESSING'].includes(r.status)).length,
      });
    }
  };

  if (!org) return <div className="flex items-center justify-center min-h-screen"><div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-accent)' }} /></div>;

  const fmt = FORMAT_INFO[org.data_format];

  return (
    <div className="flex min-h-screen">
      <PortalSidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="mb-6">
          <h1 className="text-lg font-bold">Dashboard</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Welcome, {org.name}</p>
        </div>

        {/* Org Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="portal-card p-5" style={{ borderLeft: `3px solid ${fmt.color}` }}>
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Organization</p>
            <p className="text-base font-bold mt-1">{org.name}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Code: {org.code}</p>
          </div>
          <div className="portal-card p-5" style={{ borderLeft: `3px solid ${fmt.color}` }}>
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Data Format</p>
            <p className="text-base font-bold mt-1">{fmt.label}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{fmt.desc}</p>
          </div>
          <div className="portal-card p-5" style={{ borderLeft: '3px solid var(--color-teal)' }}>
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Exchange Target</p>
            <p className="text-base font-bold mt-1">WAH Hospital</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>FHIR R4 | via ADAPT iPaaS</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Records', value: stats.total, color: 'var(--color-text-primary)' },
            { label: 'Sent to WAH', value: stats.sent, color: 'var(--color-success)' },
            { label: 'Received', value: stats.received, color: 'var(--color-info)' },
            { label: 'Pending', value: stats.pending, color: 'var(--color-warning)' },
          ].map(m => (
            <div key={m.label} className="portal-card p-5" style={{ borderLeft: `3px solid ${m.color}` }}>
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{m.label}</p>
              <p className="text-2xl font-bold mt-1" style={{ color: m.color }}>{m.value}</p>
            </div>
          ))}
        </div>

        {/* Data Requests Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Requests', value: requests.total, color: 'var(--color-text-primary)' },
            { label: 'Completed', value: requests.completed, color: 'var(--color-success)' },
            { label: 'Pending Requests', value: requests.pending, color: 'var(--color-warning)' },
          ].map(m => (
            <div key={m.label} className="portal-card p-5" style={{ borderLeft: `3px solid ${m.color}` }}>
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{m.label}</p>
              <p className="text-2xl font-bold mt-1" style={{ color: m.color }}>{m.value}</p>
            </div>
          ))}
        </div>

        {/* Workflow */}
        <div className="portal-card p-6">
          <h2 className="text-sm font-bold mb-4">Data Exchange Workflow</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="flex gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-accent-glow)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-bright)" strokeWidth="1.5"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Send Data</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Send patient records to WAH. AI converts {fmt.label} → FHIR R4.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-teal-glow)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-teal)" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Request Data</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Request patient records from WAH. AI converts FHIR R4 → {fmt.label}.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-accent-glow)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Receive Data</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Receive converted records from WAH in your {fmt.label} format.</p>
              </div>
            </div>
          </div>
          <div className="flex gap-3 mt-5 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <a href="/save" className="portal-btn portal-btn-primary text-sm">New Patient Record</a>
            <a href="/request" className="portal-btn portal-btn-teal text-sm">Request from WAH</a>
            <a href="/records" className="portal-btn portal-btn-secondary text-sm">View Records</a>
          </div>
        </div>
      </main>
    </div>
  );
}
