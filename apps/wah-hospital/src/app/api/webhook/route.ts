import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/webhook — Receives FHIR bundles from ADAPT iPaaS
 * Saves directly to WAH's own Supabase database
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transaction_id, source_system, payload, raw_source_payload, request_id, status } = body;

    console.log(`[WAH Webhook] Received from ${source_system}, tx: ${transaction_id}, reqId: ${request_id || 'none'}, status: ${status || 'RECEIVED'}`);

    // If this is a decline notification, update the request in Supabase
    if (status === 'DECLINED' && request_id) {
      const { error } = await supabaseAdmin
        .from('wah_outbound_requests')
        .update({ status: 'DECLINED', error_message: payload?.message || 'Declined by organization' })
        .eq('id', request_id);
      
      if (error) {
        console.error('Failed to update wah_outbound_requests on decline:', error);
      } else {
        console.log(`[WAH Webhook] Request ${request_id} was DECLINED.`);
      }
      return NextResponse.json({ success: true, message: 'Decline recorded' });
    }

    // Extract patient info from FHIR Bundle for searchable columns
    let patientName = 'Unknown';
    let philhealthNo = '';
    let gender = 'unknown';
    let birthDate = null;
    let diagCode = '';
    let diagDisplay = '';

    const entries = (payload?.entry || []) as Array<Record<string, unknown>>;
    for (const entry of entries) {
      const resource = entry.resource as Record<string, unknown>;
      if (resource?.resourceType === 'Patient') {
        const names = (resource.name as Array<Record<string, unknown>>) || [];
        if (names[0]) {
          const given = ((names[0].given as string[]) || []).join(' ');
          patientName = `${names[0].family || ''}, ${given}`.trim();
        }
        gender = (resource.gender as string) || 'unknown';
        birthDate = (resource.birthDate as string) || null;
        const ids = (resource.identifier as Array<Record<string, unknown>>) || [];
        const phId = ids.find(id => (id.system as string)?.includes('philhealth'));
        if (phId) philhealthNo = (phId.value as string) || '';
      }
      if (resource?.resourceType === 'Condition') {
        const code = resource.code as Record<string, unknown>;
        const coding = ((code?.coding as Array<Record<string, unknown>>) || []);
        if (coding[0]) {
          diagCode = (coding[0].code as string) || '';
          diagDisplay = (coding[0].display as string) || (code?.text as string) || '';
        }
      }
    }

    const { data, error } = await supabaseAdmin
      .from('wah_patients')
      .insert({
        patient_name: patientName,
        philhealth_no: philhealthNo,
        gender,
        birth_date: birthDate,
        diagnosis_code: diagCode,
        diagnosis_display: diagDisplay,
        fhir_bundle: payload,
        raw_source_payload: raw_source_payload || null,
        status: 'RECEIVED',
        source: 'RECEIVED',
      })
      .select()
      .single();

    if (error) {
      console.error('[WAH Webhook] DB save error:', error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    if (request_id) {
      const { error: updateError } = await supabaseAdmin
        .from('wah_outbound_requests')
        .update({ status: 'COMPLETED' })
        .eq('id', request_id);
      
      if (updateError) {
        console.error('Failed to update wah_outbound_requests on success:', updateError);
      } else {
        console.log(`[WAH Webhook] Request ${request_id} was COMPLETED.`);
      }
    }

    console.log(`[WAH Webhook] Saved as received FHIR record: ${data.id}`);
    return NextResponse.json({ success: true, message: 'FHIR Bundle received and saved' });
  } catch (error) {
    console.error('[WAH Webhook] Error:', error);
    return NextResponse.json({ success: false, message: 'Failed to process' }, { status: 500 });
  }
}
