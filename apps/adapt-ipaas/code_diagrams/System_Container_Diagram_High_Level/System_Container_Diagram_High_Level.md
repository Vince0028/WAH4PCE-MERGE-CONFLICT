# System Container Diagram (High Level) - WAH4PCE Interoperability Server

| C4 Container | Implementation File | Description |
| :--- | :--- | :--- |
| 🖥️ **Web Dashboard** | [`src/app/page.tsx`](./src/app/page.tsx) | Next.js entry point representing the frontend application boundary. |
| ⚙️ **Interoperability Routing & Engine** | [`src/app/api/ingest/route.ts`](./src/app/api/ingest/route.ts) | The core engine routing incoming requests, managing the pipeline, and transforming data. |
| 💾 **Temporary Staging Database** | [`src/lib/supabase.ts`](./src/lib/supabase.ts) | Staging database connection (Supabase/PostgreSQL used in prototype). |
| 🧠 **Local LLM Engine** | [`src/lib/ai.ts`](./src/lib/ai.ts) | Inference runtime for running semantic translations (Gemini/Groq used in prototype). |

### `<<container>> Web Dashboard [Next.js, React]`

**File:** [`apps/adapt-ipaas/src/app/page.tsx`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/page.tsx) (282 lines)

The full dashboard is a client-side React page that fetches metrics and transaction data from the API, computes mapping percentages, and renders metric cards, direction stats, format breakdowns, and a real-time transaction activity table.

```tsx
'use client';
import { useEffect, useState, useMemo } from 'react';
import Sidebar from '@/components/Sidebar';
import { calculateMappingPercentage, calculateSourceFillCount } from '@/lib/mapping-calc';

async function safeFetch(url: string) {
  const res = await fetch(url);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { success: false }; }
}

interface Metrics {
  total_records: number; success_count: number; pending_count: number;
  quarantined_count: number; transforming_count: number; success_rate: number;
  ihomis_to_wah: number; wah_to_ihomis: number;
  hl7v2_count: number; fhir_count: number;
}

interface Transaction {
  id: string; source_system: string; destination_system: string;
  source_format: string; destination_format: string;
  status: string; created_at: string;
  raw_payload?: Record<string, unknown> | null;
  transformed_payload?: Record<string, unknown> | null;
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

  // Pre-compute mapping percentages for all transactions
  const txMappings = useMemo(() => {
    const map: Record<string, { src: number; dest: number; srcFilled: number; srcTotal: number; destFilled: number; destTotal: number }> = {};
    for (const tx of recentTx) {
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
  }, [recentTx]);

  // Average mapping % across successful transactions
  const avgMapping = useMemo(() => {
    const successTx = recentTx.filter(tx => tx.status === 'SUCCESS' && txMappings[tx.id]?.destTotal > 0);
    if (successTx.length === 0) return 0;
    const sum = successTx.reduce((acc, tx) => acc + (txMappings[tx.id]?.dest || 0), 0);
    return Number((sum / successTx.length).toFixed(1));
  }, [recentTx, txMappings]);

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

  // Color for mapping percentage
  const pctColor = (pct: number) => {
    if (pct >= 85) return '#059669'; // green
    if (pct >= 60) return '#d97706'; // amber
    return '#dc2626'; // red
  };

  const pctBg = (pct: number) => {
    if (pct >= 85) return 'rgba(5,150,105,0.08)';
    if (pct >= 60) return 'rgba(217,119,6,0.08)';
    return 'rgba(220,38,38,0.08)';
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
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="ipaas-card p-4 h-[104px] animate-pulse flex flex-col justify-between border-none" style={{ backgroundColor: 'var(--color-bg-card)' }}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-4 h-4 rounded-none bg-gray-200" />
                    <div className="w-20 h-2.5 rounded-none bg-gray-200" />
                  </div>
                  <div className="w-12 h-8 rounded-none bg-gray-200 mt-auto" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="ipaas-card p-4 h-[104px] animate-pulse border-none" style={{ backgroundColor: 'var(--color-bg-card)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-none bg-gray-200" />
                    <div className="w-24 h-3 rounded-none bg-gray-200" />
                  </div>
                  <div className="w-10 h-6 rounded-none bg-gray-200 mt-2" />
                </div>
              ))}
            </div>
            <div className="ipaas-card h-[360px] animate-pulse border-none" style={{ backgroundColor: 'var(--color-bg-card)' }}>
              <div className="h-12 w-full bg-gray-100 border-b border-gray-200" />
              <div className="p-4 space-y-4">
                {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-4 bg-gray-100 w-full" />)}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Main Metrics (Asymmetric Bento Grid) */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              {[
                { label: 'Total Records', value: metrics?.total_records || 0, color: '#8b5cf6', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 12a9 9 0 11-6.22-8.56"/></svg> },
                { label: 'Success Rate', value: `${metrics?.success_rate || 0}%`, color: '#059669', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="20 6 9 17 4 12"/></svg> },
                { label: 'Avg Mapping', value: `${avgMapping}%`, color: pctColor(avgMapping), icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg> },
                { label: 'Pending', value: (metrics?.pending_count || 0) + (metrics?.transforming_count || 0), color: '#d97706', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
                { label: 'Quarantined', value: metrics?.quarantined_count || 0, color: '#dc2626', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
              ].map(m => (
                <div key={m.label} className="ipaas-card p-4 flex flex-col justify-between">
                  <div className="flex items-center gap-1.5 mb-2" style={{ color: m.color }}>
                    {m.icon}
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>{m.label}</span>
                  </div>
                  <p className="text-3xl font-black tracking-tighter">{m.value}</p>
                </div>
              ))}
            </div>

            {/* Secondary Stats (Asymmetric Grid) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {/* Direction Cards */}
              <div className="ipaas-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-none flex items-center justify-center" style={{ background: 'rgba(37,99,235,0.08)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </div>
                  <div><p className="text-xs font-medium">iHOMIS → WAH</p><p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>HL7v2 → FHIR R4</p></div>
                </div>
                <p className="text-2xl font-bold" style={{ color: '#2563eb' }}>{metrics?.ihomis_to_wah || 0}</p>
              </div>
              
              <div className="ipaas-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-none flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.08)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="1.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                  </div>
                  <div><p className="text-xs font-medium">WAH → iHOMIS</p><p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>FHIR R4 → HL7v2</p></div>
                </div>
                <p className="text-2xl font-bold" style={{ color: '#8b5cf6' }}>{metrics?.wah_to_ihomis || 0}</p>
              </div>

              {/* Format Breakdown */}
              {[
                { label: 'HL7 v2.x', count: metrics?.hl7v2_count || 0, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
                { label: 'FHIR R4', count: metrics?.fhir_count || 0, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
              ].map(f => (
                <div key={f.label} className="ipaas-card p-4 flex flex-col justify-center">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-none" style={{ background: f.bg, color: f.color }}>{f.label}</span>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: f.color }}>{f.count}</p>
                  <p className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>transformations</p>
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
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No transactions yet. Send data from iHOMIS or WAH.</p>
                </div>
              ) : (
              <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                <table className="data-table">
                  <thead><tr><th>Transaction ID</th><th>Direction</th><th>Formats</th><th>Sent</th><th>Received</th><th>Status</th><th>Date</th></tr></thead>
                  <tbody>
                    {recentTx.map(tx => {
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
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-none mr-1" style={{ background: srcFmt.bg, color: srcFmt.color }}>{formatLabel(tx.source_format)}</span>
                            <span style={{ color: 'var(--color-text-muted)' }}>→</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-none ml-1" style={{ background: dstFmt.bg, color: dstFmt.color }}>{formatLabel(tx.destination_format)}</span>
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
```

### `<<container>> Interoperability Routing & ADAPT Engine [Golang, MCP]`

**File:** [`apps/adapt-ipaas/src/app/api/ingest/route.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/api/ingest/route.ts) (281 lines)

This is the core engine — a single 250-line route handler that orchestrates the entire pipeline: request validation → consent gatekeeper → staging → AI transformation → validation → webhook forwarding.

```ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { transformWithAI, getTransformDirection } from '@/lib/ai';
import type { DataFormat } from '@/lib/ai';
import { validateTransformation } from '@/lib/validator';
import { fallbackTransform } from '@/lib/mapping-calc';

/**
 * POST /api/ingest
 * Main ingestion endpoint — receives data from any organization or WAH,
 * stores it in Supabase, triggers AI transformation, validates,
 * and forwards to the destination system.
 *
 * Now supports dynamic organization names and 2 data formats:
 * HL7V2, FHIR_R4
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      source_system,
      destination_system,
      source_format: rawSourceFormat,
      destination_format: rawDestFormat,
      payload,
      original_json,
      consent_signed,
      request_id,
      ipaas_transaction_id
    } = body;

    // --- 1. Validate request ---
    if (!source_system || !destination_system || !payload) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields: source_system, destination_system, payload' },
        { status: 400 }
      );
    }

    // Determine formats (default to legacy behavior if not specified)
    const sourceFormat: DataFormat = rawSourceFormat || (source_system === 'WAH' ? 'FHIR_R4' : 'HL7V2');
    const destFormat: DataFormat = rawDestFormat || (destination_system === 'WAH' ? 'FHIR_R4' : 'HL7V2');

    if (source_system === destination_system) {
      return NextResponse.json(
        { success: false, message: 'source_system and destination_system cannot be the same' },
        { status: 400 }
      );
    }

    console.log(`[External Microservice (ADAPT)] Received from ${source_system} (${sourceFormat}) → ${destination_system} (${destFormat})`);

    // --- 1b. Check patient data privacy consent ---
    if (!consent_signed) {
      const consentError = 'Patient data privacy consent form not signed or agreed. Record cannot be processed without patient consent per Republic Act 10173 (Data Privacy Act of 2012).';
      console.warn(`[System (Internal)] QUARANTINED — No consent: ${consentError}`);

      const rawPayloadForDb = typeof payload === 'string'
        ? { message: payload, format: sourceFormat }
        : payload;

      const { data: quarantinedRecord } = await supabaseAdmin
        .from('adapt_transaction_logs')
        .insert({
          source_system,
          destination_system,
          source_format: sourceFormat,
          destination_format: destFormat,
          raw_payload: rawPayloadForDb,
          status: 'QUARANTINED',
          error_message: consentError,
        })
        .select()
        .single();

      return NextResponse.json({
        success: false,
        transaction_id: quarantinedRecord?.id,
        status: 'QUARANTINED',
        message: consentError,
      }, { status: 422 });
    }

    // --- 2. Use existing transaction or insert new one as PENDING ---
    const rawPayloadForDb = typeof payload === 'string'
      ? { message: payload, format: sourceFormat }
      : payload;

    let transactionId: string;

    if (ipaas_transaction_id) {
      // First fetch to check version_etag if provided (Optimistic Locking)
      if (body.version_etag) {
        const { data: existingRecord } = await supabaseAdmin
          .from('adapt_transaction_logs')
          .select('version_etag')
          .eq('id', ipaas_transaction_id)
          .single();
          
        if (existingRecord && existingRecord.version_etag !== body.version_etag) {
          return NextResponse.json({ success: false, message: 'Record version conflict (eTag mismatch)' }, { status: 409 });
        }
      }

      // Update the existing PENDING transaction (created during the request phase)
      const { data: updatedData, error: updateErr } = await supabaseAdmin
        .from('adapt_transaction_logs')
        .update({
          raw_payload: rawPayloadForDb,
          status: 'PENDING',
          error_message: null,
          version_etag: body.version_etag ? body.version_etag + 1 : undefined
        })
        .eq('id', ipaas_transaction_id)
        .select();
        
      if (updateErr || !updatedData || updatedData.length === 0) {
        return NextResponse.json({ success: false, message: 'Transaction record not found' }, { status: 404 });
      }
      
      transactionId = ipaas_transaction_id;
      console.log(`[System (Internal)] Reusing existing transaction ${transactionId}`);
    } else {
      const { data: insertedRecord, error: insertError } = await supabaseAdmin
        .from('adapt_transaction_logs')
        .insert({
          source_system,
          destination_system,
          source_format: sourceFormat,
          destination_format: destFormat,
          raw_payload: rawPayloadForDb,
          status: 'PENDING',
        })
        .select()
        .single();

      if (insertError) {
        console.error('[System (Internal)] Supabase insert error:', insertError);
        return NextResponse.json(
          { success: false, message: 'Failed to store transaction', error: insertError.message },
          { status: 500 }
        );
      }
      transactionId = insertedRecord.id;
    }

    console.log(`[System (Internal)] Transaction ${transactionId} stored as PENDING`);

    // --- 3. Update to TRANSFORMING ---
    await supabaseAdmin
      .from('adapt_transaction_logs')
      .update({ status: 'TRANSFORMING' })
      .eq('id', transactionId);

    console.log(`[System (Internal)] Transaction ${transactionId} → TRANSFORMING`);

    // --- 4. AI Transformation & Fallback ---
    const direction = getTransformDirection(sourceFormat, destFormat);
    let transformResult = await transformWithAI(payload, direction);

    if (!transformResult.success || !transformResult.data) {
      console.warn(`[System (Internal)] Automated Process AI failed: ${transformResult.error}. Engaging Deterministic Syntactic Fallback for Transaction ${transactionId}.`);
      try {
        const fallbackData = fallbackTransform(payload as Record<string, unknown>, direction);
        transformResult = {
          success: true,
          data: fallbackData,
          error: null,
          usedModel: 'Algorithmic Fallback Mapper'
        };
      } catch (fallbackErr) {
        await supabaseAdmin
          .from('adapt_transaction_logs')
          .update({
            status: 'QUARANTINED',
            error_message: `AI failed and fallback crashed: ${fallbackErr}`,
          })
          .eq('id', transactionId);

        console.error(`[System (Internal)] Transaction ${transactionId} QUARANTINED (Fallback failed)`);

        return NextResponse.json({
          success: false,
          transaction_id: transactionId,
          status: 'QUARANTINED',
          message: `Transformation failed entirely`,
        }, { status: 422 });
      }
    }

    // --- 5. Validate the transformed output ---
    const validation = validateTransformation(transformResult.data, direction);

    if (!validation.valid) {
      const errorMsg = `Validation errors: ${validation.errors.join('; ')}`;
      await supabaseAdmin
        .from('adapt_transaction_logs')
        .update({
          status: 'QUARANTINED',
          transformed_payload: transformResult.data,
          error_message: errorMsg,
        })
        .eq('id', transactionId);

      console.error(`[System (Internal)] Transaction ${transactionId} QUARANTINED: ${errorMsg}`);

      return NextResponse.json({
        success: false,
        transaction_id: transactionId,
        status: 'QUARANTINED',
        message: errorMsg,
      }, { status: 400 });
    }

    // --- 6. Forward to destination system ---
    // External systems can pass `webhook_url` to receive the transformed payload.
    // Falls back to env vars, then localhost defaults for local dev.
    const resolveWebhookUrl = (): string => {
      // 1. Explicit webhook_url in the request body (for external integrations)
      if (body.webhook_url) return body.webhook_url;
      // 2. Environment variable per system
      if (destination_system === 'WAH') return process.env.WAH_WEBHOOK_URL || 'http://localhost:3002/api/webhook';
      // 3. Default to iHOMIS
      return process.env.IHOMIS_WEBHOOK_URL || 'http://localhost:3001/api/webhook';
    };
    const webhookUrl = resolveWebhookUrl();

    let forwardSuccess = false;
    let forwardError = '';

    try {
      const forwardResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: transactionId,
          source_system,
          payload: transformResult.data,
          raw_source_payload: original_json || rawPayloadForDb,
          request_id,
        }),
      });

      forwardSuccess = forwardResponse.ok;
      if (!forwardSuccess) {
        forwardError = `Webhook returned ${forwardResponse.status}`;
      }
    } catch (err) {
      forwardError = err instanceof Error ? err.message : 'Webhook request failed';
      console.warn(`[External Microservice (ADAPT)] Forward to ${destination_system} failed: ${forwardError}`);
    }

    // --- 7. Update Supabase with final status ---
    const finalStatus = 'SUCCESS';
    await supabaseAdmin
      .from('adapt_transaction_logs')
      .update({
        status: finalStatus,
        transformed_payload: transformResult.data,
        error_message: forwardSuccess ? null : `Forwarding note: ${forwardError}`,
      })
      .eq('id', transactionId);

    console.log(`[System (Internal)] Transaction ${transactionId} → ${finalStatus} (model: ${transformResult.usedModel})`);

    return NextResponse.json({
      success: true,
      transaction_id: transactionId,
      status: finalStatus,
      message: `Data transformed (${sourceFormat}→${destFormat}) and ${forwardSuccess ? 'forwarded' : 'stored'} successfully`,
      forwarded: forwardSuccess,
    });

  } catch (error) {
    console.error('[System (Internal)] Unexpected error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### `<<container>> Temporary Staging Database [MongoDB]`

**File:** [`apps/adapt-ipaas/src/lib/supabase.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/lib/supabase.ts) (28 lines)

Uses a lazy-initialized Supabase client with a Proxy pattern for deferred credential validation.

```ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('your-')) {
      throw new Error('Supabase credentials not configured. Update .env.local with real values.');
    }
    _supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _supabase;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase = new Proxy({} as SupabaseClient, {
  get: (_, prop) => {
    const client = getSupabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (client as any)[prop as string];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export const supabaseAdmin = supabase;
```

### `<<container>> Local LLM Engine [Inference Runtime]`

**File:** [`apps/adapt-ipaas/src/lib/ai.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/lib/ai.ts) (209 lines)

This is the AI engine with a **multi-model fallback chain** (Gemini → Groq) and full HL7v2↔FHIR R4 system prompts.

```ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

// Model fallback chain — try Gemini first, then juggle to Groq
export const MODEL_FALLBACKS = [
  { provider: 'gemini', model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite' },
  { provider: 'gemini', model: 'gemini-2.5-flash-lite' },
  { provider: 'gemini', model: 'gemini-2.5-flash' },
  { provider: 'groq', model: 'llama-3.3-70b-versatile' },
  { provider: 'groq', model: 'mixtral-8x7b-32768' },
  { provider: 'groq', model: 'llama3-70b-8192' }
];

// ============================================
// System Prompts for all format pairs
// ============================================

const HL7V2_TO_FHIR_PROMPT = `You are a healthcare data transformation engine for the Philippine Local Health Information Exchange (LHIE).

Your task: Convert the input flat JSON patient record (representing a simplified HL7 v2 payload) into a FULLY VALID PH Core HL7 FHIR R4 Transaction Bundle.

The output FHIR Bundle MUST contain:
1. **Patient**:
   - name[0].given: [patient_fname, patient_mname] (Array of strings. Omit mname if empty)
   - name[0].family: patient_lname
   - identifier: PhilHealth (system: "https://www.philhealth.gov.ph/memberid") from philhealth_no
   - telecom[0]: phone (system: "phone", value: contact_no)
   - address: line[0]: address_street, line[1]: address_barangay, city: address_city, district: address_province, postalCode: address_zip
   - gender: M=male, F=female
   - birthDate: dob
2. **Encounter**:
   - status: "finished", class: "AMB"
   - serviceProvider.display: referring_facility_name
   - participant[0].individual.display: referring_physician
   - reasonCode[0].text: referral_reason or chief_complaint
   - priority: ROUTINE/URGENT/EMERGENCY
3. **Observation** (Create a resource for EACH valid numeric vital sign in the "vitals" object using these LOINC codes):
   - bp_systolic: 8480-6 (Systolic blood pressure)
   - bp_diastolic: 8462-4 (Diastolic blood pressure)
   - heart_rate: 8867-4 (Heart rate)
   - temperature: 8310-5 (Body temperature)
   - respiratory_rate: 9279-1 (Respiratory rate)
   - oxygen_saturation: 2708-6 (Oxygen saturation)
   - weight_kg: 29463-7 (Body weight)
   - height_cm: 8302-2 (Body height)
   *Ensure each Observation includes valueQuantity with the numeric value and appropriate unit.*
4. **Condition**:
   - code: ICD-10 coding from diagnosis_code
   - note[0].text: chief_complaint

Bundle: type "transaction", fullUrl using "urn:uuid:" format, request with method "POST".
Output ONLY valid JSON. No markdown, no code fences, no explanation.`;

const FHIR_TO_HL7V2_PROMPT = `You are a healthcare data transformation engine for the Philippine Local Health Information Exchange (LHIE).

Your task: Convert the following PH Core HL7 FHIR R4 Bundle into a flat JSON format compatible with HL7 v2 systems.

Extract data from the FHIR Bundle resources (Patient, Encounter, Observation, Condition) and map them to this EXACT structure:

{
  "patient_fname": "from Patient.name[0].given[0]",
  "patient_lname": "from Patient.name[0].family",
  "patient_mname": "from Patient.name[0].given[1] or empty string",
  "patient_suffix": "from Patient.name[0].suffix[0] or empty string",
  "dob": "Patient.birthDate in YYYY-MM-DD",
  "sex": "M or F from Patient.gender (male=M, female=F)",
  "civil_status": "S/M/W/D from Patient.maritalStatus",
  "philhealth_no": "from Patient.identifier where system contains philhealth",
  "contact_no": "from Patient.telecom where system is phone",
  "address_street": "from Patient.address[0].line[0]",
  "address_barangay": "from Patient.address[0].line[1] or empty",
  "address_city": "from Patient.address[0].city",
  "address_province": "from Patient.address[0].district",
  "address_zip": "from Patient.address[0].postalCode",
  "vitals": {
    "bp_systolic": "number from BP component LOINC 8480-6",
    "bp_diastolic": "number from BP component LOINC 8462-4",
    "heart_rate": "number from LOINC 8867-4",
    "temperature": "number from LOINC 8310-5",
    "respiratory_rate": "number from LOINC 9279-1",
    "oxygen_saturation": "number from LOINC 2708-6 or null",
    "weight_kg": "number from LOINC 29463-7",
    "height_cm": "number from LOINC 8302-2"
  },
  "chief_complaint": "from Condition.note or Encounter.reasonCode",
  "diagnosis_code": "ICD-10 code from Condition.code.coding",
  "diagnosis_desc": "display from Condition.code",
  "diagnosis_type": "admitting/final/working from Condition.verificationStatus",
  "referring_facility_code": "from Encounter.serviceProvider or generate",
  "referring_facility_name": "from Encounter.serviceProvider display",
  "referring_physician": "from Encounter.participant display",
  "referring_physician_license": "from identifier or empty",
  "referral_reason": "from Encounter.reasonCode text",
  "priority": "ROUTINE/URGENT/EMERGENCY from Encounter.priority"
}

All numeric vitals must be numbers, not strings. Missing fields should use empty string or 0.
Output ONLY valid JSON. No markdown, no code fences, no explanation.`;


// ============================================
// Format type definitions
// ============================================
export type DataFormat = 'HL7V2' | 'FHIR_R4';
export type TransformDirection =
  | 'HL7V2_TO_FHIR_R4'
  | 'FHIR_R4_TO_HL7V2'
  // Legacy aliases
  | 'IHOMIS_TO_FHIR'
  | 'FHIR_TO_IHOMIS';

function getPromptForDirection(direction: TransformDirection): string {
  switch (direction) {
    case 'HL7V2_TO_FHIR_R4':
    case 'IHOMIS_TO_FHIR':
      return HL7V2_TO_FHIR_PROMPT;
    case 'FHIR_R4_TO_HL7V2':
    case 'FHIR_TO_IHOMIS':
      return FHIR_TO_HL7V2_PROMPT;
    default:
      return HL7V2_TO_FHIR_PROMPT;
  }
}

/**
 * Determine the transformation direction from source and destination formats.
 */
export function getTransformDirection(sourceFormat: DataFormat, destFormat: DataFormat): TransformDirection {
  const key = `${sourceFormat}_TO_${destFormat}`;
  const validDirections: Record<string, TransformDirection> = {
    'HL7V2_TO_FHIR_R4': 'HL7V2_TO_FHIR_R4',
    'FHIR_R4_TO_HL7V2': 'FHIR_R4_TO_HL7V2',
  };
  return validDirections[key] || 'HL7V2_TO_FHIR_R4';
}

/**
 * Transform data using AI with automatic model fallback juggling.
 * If Gemini hits quota, it instantly falls back to Groq LPU models.
 */
export async function transformWithAI(
  payload: unknown,
  direction: TransformDirection
): Promise<{ success: boolean; data: Record<string, unknown> | null; error: string | null; usedModel?: string }> {
  const systemPrompt = getPromptForDirection(direction);

  const inputData = typeof payload === 'string'
    ? payload
    : JSON.stringify(payload, null, 2);

  var prompt = systemPrompt + '\n\n## Code Flow Diagram\n```mermaid
graph TD
    A[Web Dashboard] -->|Monitors| B[Interoperability Routing & Engine]
    B -->|Stages Payloads| C[(Temporary Staging Database)]
    B <-->|Translates Data| D[Local LLM Engine]
    
    classDef default fill:#f9f9f9,stroke:#333,stroke-width:2px;
    class A,B,D default;
    class C default;
```\n\n\nInput Data:\n' + inputData;

  // Deduplicate model list while preserving order
  var models = MODEL_FALLBACKS.filter(function(v, i, a) { return a.findIndex(function(t) { return t.model === v.model; }) === i; });

  for (var idx = 0; idx < models.length; idx++) {
    var provider = models[idx].provider;
    var modelName = models[idx].model;
    try {
      console.log('[AI] Trying ' + provider + ' model: ' + modelName + ' for ' + direction + '...');

      var responseText = '';

      if (provider === 'gemini' && genAI) {
        var model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
        });
        var result = await model.generateContent(prompt);
        responseText = result.response.text();
      } else if (provider === 'groq' && groq) {
        var completion = await groq.chat.completions.create({
          messages: [
            { role: 'system' as const, content: systemPrompt },
            { role: 'user' as const, content: 'Input Data:\n' + inputData }
          ],
          model: modelName,
          temperature: 0.1,
          response_format: { type: 'json_object' as const },
        });
        responseText = completion.choices[0]?.message?.content || '';
      } else {
        console.warn('[AI] Provider ' + provider + ' not configured (missing API key)');
        continue;
      }

      if (!responseText) throw new Error('Empty response');

      var parsedData = JSON.parse(responseText);
      console.log('[AI] Transformation successful using ' + provider + ' (' + modelName + ')');
      return { success: true, data: parsedData, error: null, usedModel: modelName };

    } catch (error) {
      var errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn('[AI] ' + provider + ' (' + modelName + ') failed: ' + errorMessage + '. Juggling to next...');
      continue;
    }
  }

  // All models exhausted
  return {
    success: false,
    data: null,
    error: 'All AI models (Gemini and Groq) exhausted or failed. Check API keys or wait for quota reset.',
  };
}
```

---