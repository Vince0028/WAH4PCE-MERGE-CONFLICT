import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const IPAAS_URL = process.env.NEXT_PUBLIC_IPAAS_API_URL || 'http://localhost:3000/api';

/**
 * POST /api/send — Send a saved FHIR record to a registered organization via iPaaS
 * Now accepts destination_org_name and destination_format so iPaaS knows
 * which format to convert FHIR R4 into.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      patient_id,
      destination_org_id,
      destination_org_name,
      destination_format,
    } = body;

    if (!patient_id) {
      return NextResponse.json({ success: false, message: 'patient_id is required' }, { status: 400 });
    }

    // Default to legacy behavior if no org specified
    const destName = destination_org_name || 'iHOMIS';
    const destFormat = destination_format || 'HL7V2';

    // 1. Fetch the patient record from local DB
    const { data: patient, error: fetchError } = await supabaseAdmin
      .from('wah_patients')
      .select('*')
      .eq('id', patient_id)
      .single();

    if (fetchError || !patient) {
      return NextResponse.json({ success: false, message: 'Record not found' }, { status: 404 });
    }

    // 2. Send the FHIR bundle to iPaaS with destination org info
    console.log(`[WAH Send] Sending patient ${patient_id} to ${destName} (${destFormat}) via iPaaS...`);

    const ipaasRes = await fetch(`${IPAAS_URL}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_system: 'WAH',
        destination_system: destName,
        source_format: 'FHIR_R4',
        destination_format: destFormat,
        payload: patient.fhir_bundle,
        original_json: patient.fhir_bundle,
        consent_signed: patient.consent_signed ?? false,
        destination_org_id: destination_org_id || null,
      }),
    });

    const ipaasData = await ipaasRes.json();

    // 3. Update local record status
    if (ipaasData.success) {
      await supabaseAdmin
        .from('wah_patients')
        .update({ status: 'SENT' })
        .eq('id', patient_id);

      console.log(`[WAH Send] Record ${patient_id} sent to ${destName}. TX: ${ipaasData.transaction_id}`);
    } else {
      await supabaseAdmin
        .from('wah_patients')
        .update({
          status: 'REJECTED',
          rejection_reason: ipaasData.message || 'Rejected by iPaaS',
        })
        .eq('id', patient_id);

      console.warn(`[WAH Send] Record ${patient_id} REJECTED: ${ipaasData.message}`);
    }

    return NextResponse.json({
      success: ipaasData.success,
      transaction_id: ipaasData.transaction_id,
      status: ipaasData.success ? 'SENT' : 'REJECTED',
      message: ipaasData.success
        ? `FHIR R4 → ${destFormat} sent to ${destName} via iPaaS (TX: ${ipaasData.transaction_id?.slice(0, 8)})`
        : ipaasData.message || 'Failed to send',
    });
  } catch (error) {
    console.error('[WAH Send] Error:', error);
    return NextResponse.json({ success: false, message: 'Failed to connect to iPaaS' }, { status: 500 });
  }
}
