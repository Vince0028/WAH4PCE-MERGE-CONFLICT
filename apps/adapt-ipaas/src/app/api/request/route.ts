import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { transformWithAI, getTransformDirection } from '@/lib/ai';
import type { DataFormat } from '@/lib/ai';

const WAH_API_URL = process.env.WAH_API_URL || 'http://localhost:3002/api';

/**
 * POST /api/request
 * Handles data requests from organizations.
 * Fetches patient data from WAH, transforms it to the org's format,
 * and returns the converted data.
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

    // --- 1. Search WAH for the patient ---
    let wahPatientData = null;

    try {
      // Try searching by PhilHealth number first
      const searchParam = philhealth_no
        ? `philhealth_no=${encodeURIComponent(philhealth_no)}`
        : `name=${encodeURIComponent(patient_name || '')}`;

      const wahRes = await fetch(`${WAH_API_URL}/patients/search?${searchParam}`);

      if (wahRes.ok) {
        const wahData = await wahRes.json();
        if (wahData.success && wahData.data) {
          wahPatientData = wahData.data;
        }
      }
    } catch (err) {
      console.warn('[iPaaS Request] WAH search failed, trying direct Supabase query:', err);
    }

    // If WAH API search failed, try direct lookup on WAH Supabase
    // (This is a prototype fallback — in production, use proper API)
    if (!wahPatientData) {
      try {
        // We need WAH's Supabase URL — for prototype, read from env
        const wahSupabaseUrl = process.env.WAH_SUPABASE_URL;
        const wahSupabaseKey = process.env.WAH_SUPABASE_KEY;

        if (wahSupabaseUrl && wahSupabaseKey) {
          const { createClient } = await import('@supabase/supabase-js');
          const wahSupabase = createClient(wahSupabaseUrl, wahSupabaseKey);

          let query = wahSupabase.from('wah_patients').select('*');
          if (philhealth_no) {
            query = query.eq('philhealth_no', philhealth_no);
          } else if (patient_name) {
            query = query.ilike('patient_name', `%${patient_name}%`);
          }

          const { data: wahRecords } = await query.limit(1).single();
          if (wahRecords) {
            wahPatientData = wahRecords;
          }
        }
      } catch {
        console.warn('[iPaaS Request] Direct WAH Supabase lookup also failed');
      }
    }

    if (!wahPatientData) {
      return NextResponse.json({
        success: false,
        message: `Patient not found in WAH (PhilHealth: ${philhealth_no || 'N/A'}, Name: ${patient_name || 'N/A'})`,
      }, { status: 404 });
    }

    console.log(`[iPaaS Request] Found patient in WAH: ${wahPatientData.patient_name || wahPatientData.id}`);

    // --- 2. Get the FHIR data from WAH ---
    const fhirData = wahPatientData.fhir_bundle || wahPatientData;

    // --- 3. Transform FHIR → org's format ---
    const targetFormat = (destFormat || 'HL7V2') as DataFormat;
    const direction = getTransformDirection('FHIR_R4', targetFormat);

    // Log the transaction
    const { data: txRecord } = await supabaseAdmin
      .from('adapt_transaction_logs')
      .insert({
        source_system: 'WAH',
        destination_system: requesting_org || 'Organization',
        source_format: 'FHIR_R4',
        destination_format: targetFormat,
        raw_payload: fhirData,
        status: 'TRANSFORMING',
      })
      .select()
      .single();

    // If the target format is already FHIR_R4, just return the data as-is
    if (targetFormat === 'FHIR_R4') {
      if (txRecord) {
        await supabaseAdmin
          .from('adapt_transaction_logs')
          .update({ status: 'SUCCESS', transformed_payload: fhirData })
          .eq('id', txRecord.id);
      }

      return NextResponse.json({
        success: true,
        transaction_id: txRecord?.id,
        data: fhirData,
        message: 'Patient data retrieved (already in FHIR R4 format)',
      });
    }

    const transformResult = await transformWithAI(fhirData, direction);

    if (!transformResult.success || !transformResult.data) {
      if (txRecord) {
        await supabaseAdmin
          .from('adapt_transaction_logs')
          .update({ status: 'QUARANTINED', error_message: transformResult.error })
          .eq('id', txRecord.id);
      }

      return NextResponse.json({
        success: false,
        transaction_id: txRecord?.id,
        message: `Transformation failed: ${transformResult.error}`,
      }, { status: 422 });
    }

    // --- 4. Mark as success ---
    if (txRecord) {
      await supabaseAdmin
        .from('adapt_transaction_logs')
        .update({ status: 'SUCCESS', transformed_payload: transformResult.data })
        .eq('id', txRecord.id);
    }

    console.log(`[iPaaS Request] Transformed FHIR→${targetFormat} for ${requesting_org} (TX: ${txRecord?.id})`);

    return NextResponse.json({
      success: true,
      transaction_id: txRecord?.id,
      data: transformResult.data,
      message: `Patient data retrieved and converted to ${targetFormat}`,
    });

  } catch (error) {
    console.error('[iPaaS Request] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
