import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { transformWithAI, getTransformDirection } from '@/lib/ai';
import type { DataFormat } from '@/lib/ai';
import { validateTransformation } from '@/lib/validator';

/**
 * POST /api/ingest
 * Main ingestion endpoint — receives data from any organization or WAH,
 * stores it in Supabase, triggers AI transformation, validates,
 * and forwards to the destination system.
 *
 * Now supports dynamic organization names and 2 data formats:
 * HL7V2, FHIR_R4
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      source_system,
      destination_system,
      source_format: rawSourceFormat,
      destination_format: rawDestFormat,
      payload,
      original_json,
      consent_signed,
      request_id,
      ipaas_transaction_id
    } = body;

    // --- 1. Validate request ---
    if (!source_system || !destination_system || !payload) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields: source_system, destination_system, payload' },
        { status: 400 }
      );
    }

    // Determine formats (default to legacy behavior if not specified)
    const sourceFormat: DataFormat = rawSourceFormat || (source_system === 'WAH' ? 'FHIR_R4' : 'HL7V2');
    const destFormat: DataFormat = rawDestFormat || (destination_system === 'WAH' ? 'FHIR_R4' : 'HL7V2');

    if (source_system === destination_system) {
      return NextResponse.json(
        { success: false, message: 'source_system and destination_system cannot be the same' },
        { status: 400 }
      );
    }

    console.log(`[iPaaS Ingest] Received from ${source_system} (${sourceFormat}) → ${destination_system} (${destFormat})`);

    // --- 1b. Check patient data privacy consent ---
    if (!consent_signed) {
      const consentError = 'Patient data privacy consent form not signed or agreed. Record cannot be processed without patient consent per Republic Act 10173 (Data Privacy Act of 2012).';
      console.warn(`[iPaaS Ingest] QUARANTINED — No consent: ${consentError}`);

      const rawPayloadForDb = typeof payload === 'string'
        ? { message: payload, format: sourceFormat }
        : payload;

      const { data: quarantinedRecord } = await supabaseAdmin
        .from('adapt_transaction_logs')
        .insert({
          source_system,
          destination_system,
          source_format: sourceFormat,
          destination_format: destFormat,
          raw_payload: rawPayloadForDb,
          status: 'QUARANTINED',
          error_message: consentError,
        })
        .select()
        .single();

      return NextResponse.json({
        success: false,
        transaction_id: quarantinedRecord?.id,
        status: 'QUARANTINED',
        message: consentError,
      }, { status: 422 });
    }

    // --- 2. Use existing transaction or insert new one as PENDING ---
    const rawPayloadForDb = typeof payload === 'string'
      ? { message: payload, format: sourceFormat }
      : payload;

    let transactionId: string;

    if (ipaas_transaction_id) {
      // Update the existing PENDING transaction (created during the request phase)
      await supabaseAdmin
        .from('adapt_transaction_logs')
        .update({
          raw_payload: rawPayloadForDb,
          status: 'PENDING',
          error_message: null,
        })
        .eq('id', ipaas_transaction_id);
      transactionId = ipaas_transaction_id;
      console.log(`[iPaaS Ingest] Reusing existing transaction ${transactionId}`);
    } else {
      const { data: insertedRecord, error: insertError } = await supabaseAdmin
        .from('adapt_transaction_logs')
        .insert({
          source_system,
          destination_system,
          source_format: sourceFormat,
          destination_format: destFormat,
          raw_payload: rawPayloadForDb,
          status: 'PENDING',
        })
        .select()
        .single();

      if (insertError) {
        console.error('[iPaaS Ingest] Supabase insert error:', insertError);
        return NextResponse.json(
          { success: false, message: 'Failed to store transaction', error: insertError.message },
          { status: 500 }
        );
      }
      transactionId = insertedRecord.id;
    }

    console.log(`[iPaaS Ingest] Transaction ${transactionId} stored as PENDING`);

    // --- 3. Update to TRANSFORMING ---
    await supabaseAdmin
      .from('adapt_transaction_logs')
      .update({ status: 'TRANSFORMING' })
      .eq('id', transactionId);

    console.log(`[iPaaS Ingest] Transaction ${transactionId} → TRANSFORMING`);

    // --- 4. AI Transformation ---
    const direction = getTransformDirection(sourceFormat, destFormat);
    const transformResult = await transformWithAI(payload, direction);

    if (!transformResult.success || !transformResult.data) {
      await supabaseAdmin
        .from('adapt_transaction_logs')
        .update({
          status: 'QUARANTINED',
          error_message: transformResult.error || 'AI transformation returned no data',
        })
        .eq('id', transactionId);

      console.error(`[iPaaS Ingest] Transaction ${transactionId} QUARANTINED: ${transformResult.error}`);

      return NextResponse.json({
        success: false,
        transaction_id: transactionId,
        status: 'QUARANTINED',
        message: `Transformation failed: ${transformResult.error}`,
      }, { status: 422 });
    }

    // --- 5. Validate the transformed output ---
    const validation = validateTransformation(transformResult.data, direction);

    if (!validation.valid) {
      const errorMsg = `Validation errors: ${validation.errors.join('; ')}`;
      await supabaseAdmin
        .from('adapt_transaction_logs')
        .update({
          status: 'QUARANTINED',
          transformed_payload: transformResult.data,
          error_message: errorMsg,
        })
        .eq('id', transactionId);

      console.error(`[iPaaS Ingest] Transaction ${transactionId} QUARANTINED: ${errorMsg}`);

      return NextResponse.json({
        success: false,
        transaction_id: transactionId,
        status: 'QUARANTINED',
        message: errorMsg,
      }, { status: 422 });
    }

    // --- 6. Forward to destination system ---
    const webhookUrl = destination_system === 'WAH'
      ? (process.env.WAH_WEBHOOK_URL || 'http://localhost:3002/api/webhook')
      : (process.env.IHOMIS_WEBHOOK_URL || 'http://localhost:3001/api/webhook');

    let forwardSuccess = false;
    let forwardError = '';

    try {
      const forwardResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: transactionId,
          source_system,
          payload: transformResult.data,
          raw_source_payload: original_json || rawPayloadForDb,
          request_id,
        }),
      });

      forwardSuccess = forwardResponse.ok;
      if (!forwardSuccess) {
        forwardError = `Webhook returned ${forwardResponse.status}`;
      }
    } catch (err) {
      forwardError = err instanceof Error ? err.message : 'Webhook request failed';
      console.warn(`[iPaaS Ingest] Forward to ${destination_system} failed: ${forwardError}`);
    }

    // --- 7. Update Supabase with final status ---
    const finalStatus = 'SUCCESS';
    await supabaseAdmin
      .from('adapt_transaction_logs')
      .update({
        status: finalStatus,
        transformed_payload: transformResult.data,
        error_message: forwardSuccess ? null : `Forwarding note: ${forwardError}`,
      })
      .eq('id', transactionId);

    console.log(`[iPaaS Ingest] Transaction ${transactionId} → ${finalStatus} (model: ${transformResult.usedModel})`);

    return NextResponse.json({
      success: true,
      transaction_id: transactionId,
      status: finalStatus,
      message: `Data transformed (${sourceFormat}→${destFormat}) and ${forwardSuccess ? 'forwarded' : 'stored'} successfully`,
      forwarded: forwardSuccess,
    });

  } catch (error) {
    console.error('[iPaaS Ingest] Unexpected error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
