import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/incoming-requests — List incoming data requests for an org
 * POST /api/incoming-requests — Receive a new data request from iPaaS (WAH requesting data)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('org_id');

    if (!orgId) {
      return NextResponse.json({ success: false, message: 'org_id is required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('incoming_requests')
      .select('*')
      .eq('target_org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Portal Incoming Requests] GET Error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { request_id, requesting_system, target_org_id, philhealth_no, patient_name, request_reason, ipaas_transaction_id } = body;

    console.log(`[Portal Incoming Requests] ${requesting_system} requesting data from org ${target_org_id} (PhilHealth: ${philhealth_no || 'N/A'})`);

    // If target_org_id is not provided, try to find the first org (prototype fallback)
    let orgId = target_org_id;
    if (!orgId) {
      const { data: orgs } = await supabaseAdmin.from('organizations').select('id').limit(1);
      if (orgs && orgs.length > 0) {
        orgId = orgs[0].id;
      } else {
        return NextResponse.json({ success: false, message: 'No target org found' }, { status: 404 });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('incoming_requests')
      .insert({
        target_org_id: orgId,
        requesting_system: requesting_system || 'WAH',
        philhealth_no: philhealth_no || null,
        patient_name: patient_name || null,
        request_reason: request_reason || 'Patient data transfer request',
        ipaas_transaction_id: ipaas_transaction_id || null,
        status: 'PENDING',
      })
      .select()
      .single();

    if (error) {
      console.error('[Portal Incoming Requests] DB insert error:', error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    console.log(`[Portal Incoming Requests] Saved incoming request ${data.id}`);
    return NextResponse.json({ success: true, message: 'Request received', data });
  } catch (error) {
    console.error('[Portal Incoming Requests] POST Error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
