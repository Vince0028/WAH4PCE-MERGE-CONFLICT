import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const WAH_API_URL = process.env.WAH_API_URL || 'http://localhost:3002/api';
const PORTAL_API_URL = process.env.PORTAL_API_URL || 'http://localhost:3001/api';

/**
 * POST /api/decline
 * Handles declines from both directions:
 *   - WAH declining an org's request → notify portal webhook
 *   - Org declining WAH's request → notify WAH (update local JSON)
 * Updates the iPaaS transaction to QUARANTINED.
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

    // Forward decline notification to the appropriate system
    if (destination_system === 'WAH') {
      // Org declined WAH's request → notify WAH by updating its local outbound request
      // WAH polls its own outbound-requests, so we just update the iPaaS transaction.
      // WAH's request-data page polls and will see the QUARANTINED status.
      console.log(`[iPaaS Decline] Decline forwarded for WAH's outbound request ${request_id}`);
      return NextResponse.json({ success: true, message: 'Decline recorded for WAH' });

    } else {
      // WAH declined org's request → notify portal webhook
      const webhookUrl = `${PORTAL_API_URL.replace('/api', '')}/api/webhook`;

      try {
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
      } catch (err) {
        console.error('[iPaaS Decline] Forward error:', err);
        return NextResponse.json({ success: true, message: 'Decline recorded (webhook forward failed)' });
      }
    }
  } catch (error) {
    console.error('[iPaaS Decline] Error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
