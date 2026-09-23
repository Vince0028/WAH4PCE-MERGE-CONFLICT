import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/incoming-requests — List all incoming data requests for the UI
 */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('ihomis_incoming_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[iHOMIS Incoming] GET error:', error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[iHOMIS Incoming] GET Error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/incoming-requests — Receive a data request from iPaaS
 * Saves the request as PENDING so iHOMIS staff can approve/decline it.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { request_id, requesting_system, philhealth_no, patient_name, request_reason, ipaas_transaction_id } = body;

    console.log(`[iHOMIS Incoming] ${requesting_system || 'WAH'} requesting data (PhilHealth: ${philhealth_no || 'N/A'}, Name: ${patient_name || 'N/A'})`);

    // Save the request as PENDING for iHOMIS staff to review
    const { data: newRequest, error } = await supabaseAdmin
      .from('ihomis_incoming_requests')
      .insert({
        requesting_system: requesting_system || 'WAH',
        request_id: request_id || null,
        philhealth_no: philhealth_no || null,
        patient_name: patient_name || null,
        request_reason: request_reason || null,
        ipaas_transaction_id: ipaas_transaction_id || null,
        status: 'PENDING',
      })
      .select()
      .single();

    if (error) {
      console.error('[iHOMIS Incoming] DB insert error:', error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    console.log(`[iHOMIS Incoming] Saved request ${newRequest.id} as PENDING`);

    return NextResponse.json({
      success: true,
      message: 'Request received and pending approval',
      data: newRequest,
    });
  } catch (error) {
    console.error('[iHOMIS Incoming] POST Error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/incoming-requests — Update a request's status (after approve/decline)
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, error_message } = body;

    if (!id || !status) {
      return NextResponse.json({ success: false, message: 'Missing id or status' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('ihomis_incoming_requests')
      .update({ status, error_message: error_message || null })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Request updated' });
  } catch (error) {
    console.error('[iHOMIS Incoming] PUT Error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
