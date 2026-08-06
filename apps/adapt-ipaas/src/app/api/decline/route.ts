import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/decline
 * Called by WAH when a data request is declined.
 * Logs the decline in iPaaS transaction logs and notifies the portal.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { request_id, destination_system, message, ipaas_transaction_id } = body;

    if (!request_id || !destination_system) {
      return NextResponse.json({ success: false, message: 'Missing request_id or destination_system' }, { status: 400 });
    }

    // Update the existing transaction to QUARANTINED (declined)
    if (ipaas_transaction_id) {
      await supabaseAdmin
        .from('adapt_transaction_logs')
        .update({
          status: 'QUARANTINED',
          error_message: message || 'Request declined by source organization',
        })
        .eq('id', ipaas_transaction_id);
      console.log(`[iPaaS Decline] Updated transaction ${ipaas_transaction_id} to QUARANTINED (declined)`);
    }

    // Forward to the requesting org's webhook
    const webhookUrl = destination_system === 'WAH'
      ? (process.env.WAH_WEBHOOK_URL || 'http://localhost:3002/api/webhook')
      : (process.env.IHOMIS_WEBHOOK_URL || 'http://localhost:3001/api/webhook');

    const forwardResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_system: 'WAH',
        request_id,
        status: 'DECLINED',
        payload: { message: message || 'Request declined' }
      }),
    });

    if (forwardResponse.ok) {
      return NextResponse.json({ success: true, message: 'Decline forwarded successfully' });
    } else {
      return NextResponse.json({ success: false, message: 'Failed to forward decline' }, { status: 502 });
    }
  } catch (error) {
    console.error('[iPaaS Decline] Error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
