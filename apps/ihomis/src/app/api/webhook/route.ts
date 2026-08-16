import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/webhook — Receives translated records from ADAPT iPaaS
 * Stores in ihomis_patients table as a RECEIVED record.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transaction_id, source_system, payload, raw_source_payload, request_id, status } = body;

    console.log(`[iHOMIS Webhook] Received from ${source_system}, tx: ${transaction_id}, reqId: ${request_id || 'none'}, status: ${status || 'RECEIVED'}`);

    // If this is a decline notification, just log it
    if (status === 'DECLINED' && request_id) {
      console.log(`[iHOMIS Webhook] Request ${request_id} was DECLINED.`);
      return NextResponse.json({ success: true, message: 'Decline recorded' });
    }

    // Extract metadata from payload
    const patientName = payload?.patient_lname
      ? `${payload.patient_lname || ''}, ${payload.patient_fname || ''} ${payload.patient_mname || ''}`.trim()
      : payload?.patient_name || 'Received Record';

    const { data, error } = await supabaseAdmin
      .from('ihomis_patients')
      .insert({
        patient_name: patientName,
        philhealth_no: payload?.philhealth_no || '',
        sex: payload?.sex || payload?.gender || '',
        dob: payload?.dob || payload?.birthDate || null,
        diagnosis_code: payload?.diagnosis_code || '',
        diagnosis_desc: payload?.diagnosis_desc || '',
        priority: payload?.priority || 'ROUTINE',
        hl7v2_payload: payload || {},
        raw_source_payload: raw_source_payload || null,
        status: 'RECEIVED',
        source: 'RECEIVED',
      })
      .select()
      .single();

    if (error) {
      console.error('[iHOMIS Webhook] DB save error:', error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    console.log(`[iHOMIS Webhook] Saved as received record: ${data.id}`);
    return NextResponse.json({ success: true, message: 'Record received and saved' });
  } catch (error) {
    console.error('[iHOMIS Webhook] Error:', error);
    return NextResponse.json({ success: false, message: 'Failed to process' }, { status: 500 });
  }
}
