import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/metrics
 * Returns aggregated dashboard metrics
 * Updated to support dynamic org names and format tracking
 */
export async function GET() {
  try {
    // Fetch all counts in parallel
    const [totalRes, successRes, pendingRes, quarantinedRes, transformingRes, toWahRes, fromWahRes] =
      await Promise.all([
        supabaseAdmin.from('adapt_transaction_logs').select('*', { count: 'exact', head: true }),
        supabaseAdmin.from('adapt_transaction_logs').select('*', { count: 'exact', head: true }).eq('status', 'SUCCESS'),
        supabaseAdmin.from('adapt_transaction_logs').select('*', { count: 'exact', head: true }).eq('status', 'PENDING'),
        supabaseAdmin.from('adapt_transaction_logs').select('*', { count: 'exact', head: true }).eq('status', 'QUARANTINED'),
        supabaseAdmin.from('adapt_transaction_logs').select('*', { count: 'exact', head: true }).eq('status', 'TRANSFORMING'),
        supabaseAdmin.from('adapt_transaction_logs').select('*', { count: 'exact', head: true }).eq('destination_system', 'WAH'),
        supabaseAdmin.from('adapt_transaction_logs').select('*', { count: 'exact', head: true }).eq('source_system', 'WAH'),
      ]);

    const total = totalRes.count || 0;
    const success = successRes.count || 0;
    const pending = pendingRes.count || 0;
    const quarantined = quarantinedRes.count || 0;
    const transforming = transformingRes.count || 0;
    const toWah = toWahRes.count || 0;
    const fromWah = fromWahRes.count || 0;

    const successRate = total > 0 ? Math.round((success / total) * 100) : 0;

    // Fetch format-specific stats
    const [hl7v2Res, fhirRes, cdaRes] = await Promise.all([
      supabaseAdmin.from('adapt_transaction_logs').select('*', { count: 'exact', head: true }).eq('source_format', 'HL7V2'),
      supabaseAdmin.from('adapt_transaction_logs').select('*', { count: 'exact', head: true }).eq('source_format', 'FHIR_R4'),
      supabaseAdmin.from('adapt_transaction_logs').select('*', { count: 'exact', head: true }).eq('source_format', 'CDA_R2'),
    ]);

    return NextResponse.json({
      success: true,
      metrics: {
        total_records: total,
        success_count: success,
        pending_count: pending,
        quarantined_count: quarantined,
        transforming_count: transforming,
        success_rate: successRate,
        // Direction stats
        org_to_wah: toWah,
        wah_to_org: fromWah,
        // Legacy aliases
        ihomis_to_wah: toWah,
        wah_to_ihomis: fromWah,
        // Format stats
        hl7v2_count: hl7v2Res.count || 0,
        fhir_count: fhirRes.count || 0,
        cda_count: cdaRes.count || 0,
      },
    });
  } catch (error) {
    console.error('[iPaaS Metrics] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}
