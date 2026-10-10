import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { transformWithAI, getTransformDirection } from '@/lib/ai';
import type { DataFormat } from '@/lib/ai';
import { validateTransformation } from '@/lib/validator';
import { fallbackTransform } from '@/lib/mapping-calc';

/**
 * Check the AI toggle setting from Supabase.
 * Returns true if AI is enabled, false if we should use the Go deterministic mapper.
 */
async function isAIEnabled(): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from('adapt_settings')
      .select('value')
      .eq('key', 'ai_enabled')
      .single();
    if (!data) return true; // default: AI on
    return data.value === 'true';
  } catch {
    return true; // fail open — default to AI
  }
}

/**
 * Call the Go deterministic mapper microservice.
 */
async function callGoMapper(
  payload: unknown,
  direction: string
): Promise<{ success: boolean; data: Record<string, unknown> | null; error: string | null; usedModel: string }> {
  const goMapperUrl = process.env.GO_MAPPER_URL || 'http://localhost:4000/transform';
  try {
    const res = await fetch(goMapperUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, direction }),
    });
    if (!res.ok) throw new Error(`Go mapper returned ${res.status}`);
    const json = await res.json();
    return { success: true, data: json.data, error: null, usedModel: 'Go Deterministic Mapper v1.0' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Go mapper unreachable';
    console.warn('[Go Mapper] Unreachable, falling back to TS algorithm:', msg);
    return { success: false, data: null, error: msg, usedModel: '' };
  }
}

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

    console.log(`[External Microservice (ADAPT)] Received from ${source_system} (${sourceFormat}) → ${destination_system} (${destFormat})`);

    // --- 1b. Check patient data privacy consent ---
    if (!consent_signed) {
      const consentError = 'Patient data privacy consent form not signed or agreed. Record cannot be processed without patient consent per Republic Act 10173 (Data Privacy Act of 2012).';
      console.warn(`[System (Internal)] QUARANTINED — No consent: ${consentError}`);

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
      // First fetch to check version_etag if provided (Optimistic Locking)
      if (body.version_etag) {
        const { data: existingRecord } = await supabaseAdmin
          .from('adapt_transaction_logs')
          .select('version_etag')
          .eq('id', ipaas_transaction_id)
          .single();
          
        if (existingRecord && existingRecord.version_etag !== body.version_etag) {
          return NextResponse.json({ success: false, message: 'Record version conflict (eTag mismatch)' }, { status: 409 });
        }
      }

      // Update the existing PENDING transaction (created during the request phase)
      const { data: updatedData, error: updateErr } = await supabaseAdmin
        .from('adapt_transaction_logs')
        .update({
          raw_payload: rawPayloadForDb,
          status: 'PENDING',
          error_message: null,
          version_etag: body.version_etag ? body.version_etag + 1 : undefined
        })
        .eq('id', ipaas_transaction_id)
        .select();
        
      if (updateErr || !updatedData || updatedData.length === 0) {
        return NextResponse.json({ success: false, message: 'Transaction record not found' }, { status: 404 });
      }
      
      transactionId = ipaas_transaction_id;
      console.log(`[System (Internal)] Reusing existing transaction ${transactionId}`);
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
        console.error('[System (Internal)] Supabase insert error:', insertError);
        return NextResponse.json(
          { success: false, message: 'Failed to store transaction', error: insertError.message },
          { status: 500 }
        );
      }
      transactionId = insertedRecord.id;
    }

    console.log(`[System (Internal)] Transaction ${transactionId} stored as PENDING`);

    // --- 3. Update to TRANSFORMING ---
    await supabaseAdmin
      .from('adapt_transaction_logs')
      .update({ status: 'TRANSFORMING' })
      .eq('id', transactionId);

    console.log(`[System (Internal)] Transaction ${transactionId} → TRANSFORMING`);

    // --- 4. Transform: AI or Go Deterministic Mapper ---
    const direction = getTransformDirection(sourceFormat, destFormat);
    const aiEnabled = await isAIEnabled();
    let transformResult: { success: boolean; data: Record<string, unknown> | null; error: string | null; usedModel?: string };
    let transformEngine: string;

    if (!aiEnabled) {
      // ── Algorithm Mode: call Go mapper (perfect deterministic accuracy) ──
      console.log(`[System (Internal)] AI DISABLED — using Go Deterministic Mapper for Transaction ${transactionId}`);
      transformResult = await callGoMapper(payload, direction);
      transformEngine = 'Algorithm';

      if (!transformResult.success || !transformResult.data) {
        // Go mapper unreachable — fall back to TS algorithm
        console.warn('[System (Internal)] Go mapper unreachable, using TS fallback algorithm');
        try {
          const fallbackData = fallbackTransform(payload as Record<string, unknown>, direction);
          transformResult = { success: true, data: fallbackData, error: null, usedModel: 'TS Algorithmic Mapper (Go offline)' };
          transformEngine = 'Algorithm (TS)';
        } catch (fallbackErr) {
          await supabaseAdmin.from('adapt_transaction_logs').update({ status: 'QUARANTINED', transform_engine: 'Algorithm', error_message: `Algorithm crashed: ${fallbackErr}` }).eq('id', transactionId);
          return NextResponse.json({ success: false, transaction_id: transactionId, status: 'QUARANTINED', message: 'Transformation failed' }, { status: 422 });
        }
      }
    } else {
      // ── AI Mode: try AI with deterministic fallback ──
      transformResult = await transformWithAI(payload, direction);
      transformEngine = 'AI';

      if (!transformResult.success || !transformResult.data) {
        console.warn(`[System (Internal)] AI failed: ${transformResult.error}. Engaging Deterministic Fallback for Transaction ${transactionId}.`);
        try {
          const fallbackData = fallbackTransform(payload as Record<string, unknown>, direction);
          transformResult = { success: true, data: fallbackData, error: null, usedModel: 'Algorithmic Fallback Mapper' };
          transformEngine = 'Fallback';
        } catch (fallbackErr) {
          await supabaseAdmin
            .from('adapt_transaction_logs')
            .update({ status: 'QUARANTINED', transform_engine: 'AI', error_message: `AI failed and fallback crashed: ${fallbackErr}` })
            .eq('id', transactionId);
          console.error(`[System (Internal)] Transaction ${transactionId} QUARANTINED (Fallback failed)`);
          return NextResponse.json({ success: false, transaction_id: transactionId, status: 'QUARANTINED', message: 'Transformation failed entirely' }, { status: 422 });
        }
      }
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
          transform_engine: transformEngine,
          error_message: errorMsg,
        })
        .eq('id', transactionId);

      console.error(`[System (Internal)] Transaction ${transactionId} QUARANTINED: ${errorMsg}`);

      return NextResponse.json({
        success: false,
        transaction_id: transactionId,
        status: 'QUARANTINED',
        message: errorMsg,
      }, { status: 400 });
    }

    // --- 6. Forward to destination system ---
    // External systems can pass `webhook_url` to receive the transformed payload.
    // Falls back to env vars, then localhost defaults for local dev.
    const resolveWebhookUrl = (): string => {
      // 1. Explicit webhook_url in the request body (for external integrations)
      if (body.webhook_url) return body.webhook_url;
      // 2. Environment variable per system
      if (destination_system === 'WAH') return process.env.WAH_WEBHOOK_URL || 'http://localhost:3002/api/webhook';
      // 3. Default to iHOMIS
      return process.env.IHOMIS_WEBHOOK_URL || 'http://localhost:3001/api/webhook';
    };
    const webhookUrl = resolveWebhookUrl();

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
      console.warn(`[External Microservice (ADAPT)] Forward to ${destination_system} failed: ${forwardError}`);
    }

    // --- 7. Update Supabase with final status ---
    const finalStatus = 'SUCCESS';
    await supabaseAdmin
      .from('adapt_transaction_logs')
      .update({
        status: finalStatus,
        transformed_payload: transformResult.data,
        transform_engine: transformEngine,
        error_message: forwardSuccess ? null : `Forwarding note: ${forwardError}`,
      })
      .eq('id', transactionId);

    console.log(`[System (Internal)] Transaction ${transactionId} → ${finalStatus} (model: ${transformResult.usedModel})`);

    return NextResponse.json({
      success: true,
      transaction_id: transactionId,
      status: finalStatus,
      message: `Data transformed (${sourceFormat}→${destFormat}) and ${forwardSuccess ? 'forwarded' : 'stored'} successfully`,
      forwarded: forwardSuccess,
    });

  } catch (error) {
    console.error('[System (Internal)] Unexpected error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
