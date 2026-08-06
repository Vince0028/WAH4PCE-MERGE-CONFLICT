import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/webhook — Receives translated records from ADAPT iPaaS
 * Stores in org_patients table. iPaaS sends org_id + converted payload.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transaction_id, source_system, payload, raw_source_payload, org_id } = body;

    console.log(`[Portal Webhook] Received from ${source_system}, tx: ${transaction_id}, org: ${org_id || 'auto'}`);

    // If org_id is provided, use it. Otherwise try to find org from webhook URL or default.
    let targetOrgId = org_id;

    if (!targetOrgId) {
      // Try to find an org — for now, if no org_id, skip storing
      console.warn('[Portal Webhook] No org_id provided, attempting to match...');
      // Try matching by the first available org (prototype fallback)
      const { data: orgs } = await supabaseAdmin.from('organizations').select('id').limit(1);
      if (orgs && orgs.length > 0) {
        targetOrgId = orgs[0].id;
      } else {
        return NextResponse.json({ success: false, message: 'No target org found' }, { status: 404 });
      }
    }

    // Extract metadata from payload
    const patientName = payload.patient_lname
      ? `${payload.patient_lname || ''}, ${payload.patient_fname || ''} ${payload.patient_mname || ''}`.trim()
      : payload.patient_name || 'Received Record';

    const { data, error } = await supabaseAdmin
      .from('org_patients')
      .insert({
        org_id: targetOrgId,
        patient_name: patientName,
        philhealth_no: payload.philhealth_no || '',
        sex: payload.sex || payload.gender || '',
        dob: payload.dob || payload.birthDate || null,
        diagnosis_code: payload.diagnosis_code || '',
        diagnosis_desc: payload.diagnosis_desc || '',
        priority: payload.priority || 'ROUTINE',
        data_payload: payload,
        raw_source_payload: raw_source_payload || null,
        status: 'RECEIVED',
        source: 'RECEIVED',
      })
      .select()
      .single();

    if (error) {
      console.error('[Portal Webhook] DB save error:', error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    console.log(`[Portal Webhook] Saved as received record: ${data.id}`);
    return NextResponse.json({ success: true, message: 'Record received and saved' });
  } catch (error) {
    console.error('[Portal Webhook] Error:', error);
    return NextResponse.json({ success: false, message: 'Failed to process' }, { status: 500 });
  }
}
