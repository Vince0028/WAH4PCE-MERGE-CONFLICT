import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const WAH_API_URL = process.env.WAH_API_URL || 'http://localhost:3002/api';

/**
 * POST /api/request
 * Handles data requests from organizations.
 * Logs a PENDING transaction in the iPaaS, then forwards to WAH for manual approval.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      request_id,
      requesting_org,
      requesting_org_id,
      destination_format: destFormat,
      philhealth_no,
      patient_name
    } = body;

    console.log(`[iPaaS Request] ${requesting_org} requesting data from WAH (PhilHealth: ${philhealth_no || 'N/A'}, Name: ${patient_name || 'N/A'})`);

    // --- Log in iPaaS transaction table as PENDING ---
    const { data: txRecord } = await supabaseAdmin
      .from('adapt_transaction_logs')
      .insert({
        source_system: 'WAH',
        destination_system: requesting_org || 'Organization',
        source_format: 'FHIR_R4',
        destination_format: destFormat || 'HL7V2',
        raw_payload: { request_id, philhealth_no, patient_name },
        status: 'PENDING',
      })
      .select()
      .single();

    console.log(`[iPaaS Request] Created transaction ${txRecord?.id} as PENDING`);

    // Forward the request to WAH so it can be logged and manually approved
    try {
      const wahRes = await fetch(`${WAH_API_URL}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id,
          requesting_org,
          requesting_org_id,
          destination_format: destFormat,
          philhealth_no,
          patient_name,
          ipaas_transaction_id: txRecord?.id,
        }),
      });

      if (!wahRes.ok) {
        // Mark as failed
        if (txRecord) {
          await supabaseAdmin
            .from('adapt_transaction_logs')
            .update({ status: 'QUARANTINED', error_message: 'WAH returned an error when receiving the request' })
            .eq('id', txRecord.id);
        }
        throw new Error('WAH returned an error');
      }

      return NextResponse.json({
        success: true,
        transaction_id: txRecord?.id,
        message: 'Request forwarded to WAH for approval.',
      });
    } catch (err) {
      console.error('[iPaaS Request] Failed to forward to WAH:', err);
      if (txRecord) {
        await supabaseAdmin
          .from('adapt_transaction_logs')
          .update({ status: 'QUARANTINED', error_message: 'Failed to forward request to WAH' })
          .eq('id', txRecord.id);
      }
      return NextResponse.json({
        success: false,
        transaction_id: txRecord?.id,
        message: 'Failed to notify WAH of the request.',
      }, { status: 502 });
    }

  } catch (error) {
    console.error('[iPaaS Request] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
