import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const WAH_API_URL = process.env.WAH_API_URL || 'http://localhost:3002/api';
const PORTAL_API_URL = process.env.PORTAL_API_URL || 'http://localhost:3001/api';

/**
 * POST /api/request
 * Handles bidirectional data requests:
 *   - Org → WAH: forwards to WAH's /api/requests endpoint
 *   - WAH → Org: forwards to Portal's /api/incoming-requests endpoint
 * Logs a PENDING transaction in the iPaaS for both directions.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      request_id,
      requesting_org,
      requesting_org_id,
      target_org,
      target_org_id,
      destination_format: destFormat,
      philhealth_no,
      patient_name,
      request_reason,
    } = body;

    // Determine direction
    const isWAHRequesting = requesting_org === 'WAH';
    const sourceSystem = isWAHRequesting ? (target_org || 'Organization') : 'WAH';
    const destSystem = isWAHRequesting ? 'WAH' : (requesting_org || 'Organization');
    const srcFormat = isWAHRequesting ? (destFormat || 'HL7V2') : 'FHIR_R4';
    const dstFormat = isWAHRequesting ? 'FHIR_R4' : (destFormat || 'HL7V2');

    console.log(`[iPaaS Request] ${requesting_org} requesting data from ${isWAHRequesting ? target_org : 'WAH'} (PhilHealth: ${philhealth_no || 'N/A'}, Name: ${patient_name || 'N/A'})`);

    // --- Log in iPaaS transaction table as PENDING ---
    const { data: txRecord } = await supabaseAdmin
      .from('adapt_transaction_logs')
      .insert({
        source_system: sourceSystem,
        destination_system: destSystem,
        source_format: srcFormat,
        destination_format: dstFormat,
        raw_payload: { request_id, philhealth_no, patient_name, direction: isWAHRequesting ? 'WAH_TO_ORG' : 'ORG_TO_WAH' },
        status: 'PENDING',
      })
      .select()
      .single();

    console.log(`[iPaaS Request] Created transaction ${txRecord?.id} as PENDING`);

    if (isWAHRequesting) {
      // === WAH → Org: Forward to Portal's incoming-requests endpoint ===
      try {
        const portalRes = await fetch(`${PORTAL_API_URL}/incoming-requests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            request_id,
            requesting_system: 'WAH',
            target_org_id,
            philhealth_no,
            patient_name,
            request_reason,
            ipaas_transaction_id: txRecord?.id,
          }),
        });

        if (!portalRes.ok) {
          if (txRecord) {
            await supabaseAdmin
              .from('adapt_transaction_logs')
              .update({ status: 'QUARANTINED', error_message: 'Portal returned an error when receiving the request' })
              .eq('id', txRecord.id);
          }
          throw new Error('Portal returned an error');
        }

        return NextResponse.json({
          success: true,
          transaction_id: txRecord?.id,
          message: `Request forwarded to ${target_org} for approval.`,
        });
      } catch (err) {
        console.error('[iPaaS Request] Failed to forward to Portal:', err);
        if (txRecord) {
          await supabaseAdmin
            .from('adapt_transaction_logs')
            .update({ status: 'QUARANTINED', error_message: 'Failed to forward request to Portal' })
            .eq('id', txRecord.id);
        }
        return NextResponse.json({
          success: false,
          transaction_id: txRecord?.id,
          message: 'Failed to notify the organization of the request.',
        }, { status: 502 });
      }

    } else {
      // === Org → WAH: Forward to WAH's requests endpoint ===
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
    }

  } catch (error) {
    console.error('[iPaaS Request] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
