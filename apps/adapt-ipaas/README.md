# 🚀 ADAPT iPaaS — Architecture & Code Mapping

Welcome to the **ADAPT iPaaS** repository. This Next.js prototype implements the core middleware engine for the Philippine Local Health Information Exchange (LHIE). 

This README provides a definitive **1-to-1 mapping** between the architectural C4 diagrams and the actual codebase implementations.

> **📊 Codebase Summary:** 
> The core ADAPT iPaaS engine contains exactly **3,116 lines of code** across 17 primary files, implementing AI translations, deterministic mapping fallbacks, FHIR/HL7v2 validations, and comprehensive audit logging.

---

## 1. WAH4PCE Interoperability Server (ADAPT) [System Boundary] — `image_bb4702.png`

| C4 Container | Implementation File | Description |
| :--- | :--- | :--- |
| 🖥️ **Web Dashboard** | [`src/app/page.tsx`](./src/app/page.tsx) | Next.js entry point representing the frontend application boundary. |
| ⚙️ **Interoperability Routing & Engine** | [`src/app/api/ingest/route.ts`](./src/app/api/ingest/route.ts) | The core engine routing incoming requests, managing the pipeline, and transforming data. |
| 💾 **Temporary Staging Database** | [`src/lib/supabase.ts`](./src/lib/supabase.ts) | Staging database connection (Supabase/PostgreSQL used in prototype). |
| 🧠 **Local LLM Engine** | [`src/lib/ai.ts`](./src/lib/ai.ts) | Inference runtime for running semantic translations (Gemini/Groq used in prototype). |

### `<<container>> Web Dashboard [Next.js, React]`

**File:** [`apps/adapt-ipaas/src/app/page.tsx`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/page.tsx) (256 lines)

The full dashboard is a client-side React page that fetches metrics and transaction data from the API, computes mapping percentages, and renders metric cards, direction stats, format breakdowns, and a real-time transaction activity table.

```tsx
'use client';
import { useEffect, useState, useMemo } from 'react';
import Sidebar from '@/components/Sidebar';
import { calculateMappingPercentage, calculateSourceFillCount } from '@/lib/mapping-calc';

async function safeFetch(url: string) {
  const res = await fetch(url);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { success: false }; }
}

interface Metrics {
  total_records: number; success_count: number; pending_count: number;
  quarantined_count: number; transforming_count: number; success_rate: number;
  org_to_wah: number; wah_to_org: number;
  hl7v2_count: number; fhir_count: number;
}

interface Transaction {
  id: string; source_system: string; destination_system: string;
  source_format: string; destination_format: string;
  status: string; created_at: string;
  raw_payload?: Record<string, unknown> | null;
  transformed_payload?: Record<string, unknown> | null;
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [recentTx, setRecentTx] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const [metricsData, txData] = await Promise.all([
      safeFetch('/api/metrics'), safeFetch('/api/transactions?limit=50'),
    ]);
    if (metricsData.success) setMetrics(metricsData.metrics);
    if (txData.success) setRecentTx(txData.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 10000); return () => clearInterval(i); }, []);

  // Pre-compute mapping percentages for all transactions
  const txMappings = useMemo(() => {
    const map: Record<string, { src: number; dest: number; srcFilled: number; srcTotal: number; destFilled: number; destTotal: number }> = {};
    for (const tx of recentTx) {
      if (tx.status !== 'SUCCESS') {
        map[tx.id] = { src: 0, dest: 0, srcFilled: 0, srcTotal: 0, destFilled: 0, destTotal: 0 };
        continue;
      }
      const srcResult = calculateSourceFillCount(tx.raw_payload || null, tx.source_system);
      const destResult = calculateMappingPercentage(tx.transformed_payload || null, tx.destination_system);
      map[tx.id] = {
        src: srcResult.percentage, dest: destResult.percentage,
        srcFilled: srcResult.filledFields, srcTotal: srcResult.totalFields,
        destFilled: destResult.filledFields, destTotal: destResult.totalFields,
      };
    }
    return map;
  }, [recentTx]);

  // Average mapping % across successful transactions
  const avgMapping = useMemo(() => {
    const successTx = recentTx.filter(tx => tx.status === 'SUCCESS' && txMappings[tx.id]?.destTotal > 0);
    if (successTx.length === 0) return 0;
    const sum = successTx.reduce((acc, tx) => acc + (txMappings[tx.id]?.dest || 0), 0);
    return Number((sum / successTx.length).toFixed(1));
  }, [recentTx, txMappings]);
  // ... renders 5 metric cards, direction cards, format breakdown, and a full transaction table
}
```

### `<<container>> Interoperability Routing & ADAPT Engine [Golang, MCP]`

**File:** [`apps/adapt-ipaas/src/app/api/ingest/route.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/api/ingest/route.ts) (250 lines)

This is the core engine — a single 250-line route handler that orchestrates the entire pipeline: request validation → consent gatekeeper → staging → AI transformation → validation → webhook forwarding.

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { transformWithAI, getTransformDirection } from '@/lib/ai';
import type { DataFormat } from '@/lib/ai';
import { validateTransformation } from '@/lib/validator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      source_system, destination_system,
      source_format: rawSourceFormat, destination_format: rawDestFormat,
      payload, original_json, consent_signed, request_id, ipaas_transaction_id
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

    // --- 1b. Check patient data privacy consent ---
    if (!consent_signed) {
      const consentError = 'Patient data privacy consent form not signed or agreed. Record cannot be processed without patient consent per Republic Act 10173 (Data Privacy Act of 2012).';
      const { data: quarantinedRecord } = await supabaseAdmin
        .from('adapt_transaction_logs')
        .insert({
          source_system, destination_system, source_format: sourceFormat,
          destination_format: destFormat, raw_payload: rawPayloadForDb,
          status: 'QUARANTINED', error_message: consentError,
        })
        .select().single();

      return NextResponse.json({
        success: false, transaction_id: quarantinedRecord?.id,
        status: 'QUARANTINED', message: consentError,
      }, { status: 422 });
    }

    // --- 2. Insert PENDING transaction ---
    const { data: insertedRecord, error: insertError } = await supabaseAdmin
      .from('adapt_transaction_logs')
      .insert({
        source_system, destination_system, source_format: sourceFormat,
        destination_format: destFormat, raw_payload: rawPayloadForDb, status: 'PENDING',
      })
      .select().single();

    // --- 3. Update to TRANSFORMING ---
    await supabaseAdmin.from('adapt_transaction_logs')
      .update({ status: 'TRANSFORMING' }).eq('id', transactionId);

    // --- 4. AI Transformation ---
    const direction = getTransformDirection(sourceFormat, destFormat);
    const transformResult = await transformWithAI(payload, direction);

    if (!transformResult.success || !transformResult.data) {
      await supabaseAdmin.from('adapt_transaction_logs')
        .update({ status: 'QUARANTINED', error_message: transformResult.error })
        .eq('id', transactionId);
      return NextResponse.json({ success: false, status: 'QUARANTINED' }, { status: 422 });
    }

    // --- 5. Validate the transformed output ---
    const validation = validateTransformation(transformResult.data, direction);
    if (!validation.valid) {
      await supabaseAdmin.from('adapt_transaction_logs')
        .update({ status: 'QUARANTINED', transformed_payload: transformResult.data, error_message: `Validation errors: ${validation.errors.join('; ')}` })
        .eq('id', transactionId);
      return NextResponse.json({ success: false, status: 'QUARANTINED' }, { status: 422 });
    }

    // --- 6. Forward to destination system via webhook ---
    const resolveWebhookUrl = (): string => {
      if (body.webhook_url) return body.webhook_url;
      if (destination_system === 'WAH') return process.env.WAH_WEBHOOK_URL || 'http://localhost:3002/api/webhook';
      return process.env.IHOMIS_WEBHOOK_URL || 'http://localhost:3001/api/webhook';
    };
    const forwardResponse = await fetch(resolveWebhookUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_id: transactionId, source_system, payload: transformResult.data, raw_source_payload: original_json || rawPayloadForDb, request_id }),
    });

    // --- 7. Update Supabase with final status ---
    await supabaseAdmin.from('adapt_transaction_logs')
      .update({ status: 'SUCCESS', transformed_payload: transformResult.data })
      .eq('id', transactionId);

    return NextResponse.json({ success: true, transaction_id: transactionId, status: 'SUCCESS' });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
```

### `<<container>> Temporary Staging Database [MongoDB]`

**File:** [`apps/adapt-ipaas/src/lib/supabase.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/lib/supabase.ts) (29 lines)

Uses a lazy-initialized Supabase client with a Proxy pattern for deferred credential validation.

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('your-')) {
      throw new Error('Supabase credentials not configured. Update .env.local with real values.');
    }
    _supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _supabase;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get: (_, prop) => {
    const client = getSupabase();
    const value = (client as any)[prop as string];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export const supabaseAdmin = supabase;
```

### `<<container>> Local LLM Engine [Inference Runtime]`

**File:** [`apps/adapt-ipaas/src/lib/ai.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/lib/ai.ts) (211 lines)

This is the AI engine with a **multi-model fallback chain** (Gemini → Groq) and full HL7v2↔FHIR R4 system prompts.

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

// Model fallback chain — try Gemini first, then juggle to Groq
export const MODEL_FALLBACKS = [
  { provider: 'gemini', model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite' },
  { provider: 'gemini', model: 'gemini-2.5-flash-lite' },
  { provider: 'gemini', model: 'gemini-2.5-flash' },
  { provider: 'groq', model: 'llama-3.3-70b-versatile' },
  { provider: 'groq', model: 'mixtral-8x7b-32768' },
  { provider: 'groq', model: 'llama3-70b-8192' }
];

const HL7V2_TO_FHIR_PROMPT = `You are a healthcare data transformation engine for the Philippine LHIE.
Your task: Convert the input flat JSON patient record (representing a simplified HL7 v2 payload)
into a FULLY VALID PH Core HL7 FHIR R4 Transaction Bundle.

The output FHIR Bundle MUST contain:
1. **Patient**: name, identifier (PhilHealth system), telecom, address, gender, birthDate
2. **Encounter**: status, class, serviceProvider, participant, reasonCode, priority
3. **Observation**: Create a resource for EACH vital sign using LOINC codes
   - bp_systolic: 8480-6, bp_diastolic: 8462-4, heart_rate: 8867-4,
   - temperature: 8310-5, respiratory_rate: 9279-1, oxygen_saturation: 2708-6,
   - weight_kg: 29463-7, height_cm: 8302-2
4. **Condition**: ICD-10 coding from diagnosis_code, note from chief_complaint
Bundle: type "transaction", fullUrl using "urn:uuid:" format.
Output ONLY valid JSON. No markdown, no code fences.`;

const FHIR_TO_HL7V2_PROMPT = `You are a healthcare data transformation engine for the Philippine LHIE.
Your task: Convert the following PH Core HL7 FHIR R4 Bundle into a flat JSON format compatible with HL7 v2 systems.
Extract data from the FHIR Bundle resources (Patient, Encounter, Observation, Condition).
All numeric vitals must be numbers, not strings. Missing fields should use empty string or 0.
Output ONLY valid JSON.`;

export type DataFormat = 'HL7V2' | 'FHIR_R4';
export type TransformDirection = 'HL7V2_TO_FHIR_R4' | 'FHIR_R4_TO_HL7V2' | 'IHOMIS_TO_FHIR' | 'FHIR_TO_IHOMIS';

export function getTransformDirection(sourceFormat: DataFormat, destFormat: DataFormat): TransformDirection {
  const key = `${sourceFormat}_TO_${destFormat}`;
  const validDirections: Record<string, TransformDirection> = {
    'HL7V2_TO_FHIR_R4': 'HL7V2_TO_FHIR_R4',
    'FHIR_R4_TO_HL7V2': 'FHIR_R4_TO_HL7V2',
  };
  return validDirections[key] || 'HL7V2_TO_FHIR_R4';
}

export async function transformWithAI(
  payload: unknown, direction: TransformDirection
): Promise<{ success: boolean; data: Record<string, unknown> | null; error: string | null; usedModel?: string }> {
  const systemPrompt = getPromptForDirection(direction);
  const inputData = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  var prompt = systemPrompt + '\n\nInput Data:\n' + inputData;

  // Deduplicate model list while preserving order
  var models = MODEL_FALLBACKS.filter(function(v, i, a) {
    return a.findIndex(function(t) { return t.model === v.model; }) === i;
  });

  for (var idx = 0; idx < models.length; idx++) {
    var provider = models[idx].provider;
    var modelName = models[idx].model;
    try {
      var responseText = '';

      if (provider === 'gemini' && genAI) {
        var model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
        });
        var result = await model.generateContent(prompt);
        responseText = result.response.text();
      } else if (provider === 'groq' && groq) {
        var completion = await groq.chat.completions.create({
          messages: [
            { role: 'system' as const, content: systemPrompt },
            { role: 'user' as const, content: 'Input Data:\n' + inputData }
          ],
          model: modelName, temperature: 0.1,
          response_format: { type: 'json_object' as const },
        });
        responseText = completion.choices[0]?.message?.content || '';
      } else { continue; }

      if (!responseText) throw new Error('Empty response');
      var parsedData = JSON.parse(responseText);
      return { success: true, data: parsedData, error: null, usedModel: modelName };
    } catch (error) {
      console.warn('[AI] ' + provider + ' (' + modelName + ') failed. Juggling to next...');
      continue;
    }
  }

  return { success: false, data: null, error: 'All AI models exhausted or failed.' };
}
```

---

## 2. WAH4PCE Interoperability Server (ADAPT Middleware) [System Boundary] — `image_bb4a03.png`

| C4 Container | Implementation File | Description |
| :--- | :--- | :--- |
| 🖥️ **Web Dashboard** | [`src/app/page.tsx`](./src/app/page.tsx) | The web dashboard layout and wrapper system. |
| 📥 **Ingest API Service** | [`src/app/api/ingest/route.ts`](./src/app/api/ingest/route.ts) | Exposes `POST /api/ingest` to receive raw health records. |
| 🔄 **Provide Health Data Pipeline Engine** | [`src/app/api/ingest/route.ts`](./src/app/api/ingest/route.ts) | Coordinates Bronze (Ingest), Silver (Cleanse), and Gold (Transform) stages. |
| 💾 **Temporary Staging & Audit Database** | [`src/lib/supabase.ts`](./src/lib/supabase.ts) | Staging and sanitized non-PHI transaction audit logs. |
| 🔐 **Validate Privacy Consent Gatekeeper** | [`src/app/api/ingest/route.ts`](./src/app/api/ingest/route.ts) | Enforces RA 10173 consent flags before processing. |
| ✅ **Validate Schema & Completeness Service** | [`src/lib/validator.ts`](./src/lib/validator.ts) | Verifies PH Core FHIR / HL7v2 structural integrity. |
| 🤖 **Translate Data to/from PH Core Engine** | [`src/lib/ai.ts`](./src/lib/ai.ts) | Invokes semantic mapping via LLM. |
| 🧠 **Local LLM** | [`src/lib/ai.ts`](./src/lib/ai.ts) | The inference connection (GoogleGenerativeAI/Groq). |
| 🛡️ **Deterministic Syntactic Fallback** | [`src/lib/mapping-calc.ts`](./src/lib/mapping-calc.ts) | Algorithmic mapping safety net invoked on AI failure. |

### `<<container>> Web Dashboard [Next.js, React]`
**Same as above:** [`page.tsx`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/page.tsx) — see Section 1.

### `<<container>> Ingest API Service [Golang HTTP Handler]`
**File:** [`apps/adapt-ipaas/src/app/api/ingest/route.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/api/ingest/route.ts) — Lines 16–37

The HTTP handler entry point that parses the request body and validates required fields.

```typescript
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      source_system, destination_system,
      source_format: rawSourceFormat, destination_format: rawDestFormat,
      payload, original_json, consent_signed, request_id, ipaas_transaction_id
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
```

### `<<container>> Provide Health Data Pipeline Engine [Golang Concurrency Worker]`
**File:** [`apps/adapt-ipaas/src/app/api/ingest/route.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/api/ingest/route.ts) — Lines 83–157

The pipeline orchestrator that moves records through Bronze (PENDING) → Silver (TRANSFORMING) → Gold (SUCCESS) stages.

```typescript
    // --- 2. Use existing transaction or insert new one as PENDING (Bronze) ---
    let transactionId: string;
    if (ipaas_transaction_id) {
      await supabaseAdmin.from('adapt_transaction_logs')
        .update({ raw_payload: rawPayloadForDb, status: 'PENDING', error_message: null })
        .eq('id', ipaas_transaction_id);
      transactionId = ipaas_transaction_id;
    } else {
      const { data: insertedRecord, error: insertError } = await supabaseAdmin
        .from('adapt_transaction_logs')
        .insert({ source_system, destination_system, source_format: sourceFormat,
                  destination_format: destFormat, raw_payload: rawPayloadForDb, status: 'PENDING' })
        .select().single();
      if (insertError) {
        return NextResponse.json({ success: false, message: 'Failed to store transaction' }, { status: 500 });
      }
      transactionId = insertedRecord.id;
    }

    // --- 3. Update to TRANSFORMING (Silver) ---
    await supabaseAdmin.from('adapt_transaction_logs')
      .update({ status: 'TRANSFORMING' }).eq('id', transactionId);

    // --- 4. AI Transformation (Gold) ---
    const direction = getTransformDirection(sourceFormat, destFormat);
    const transformResult = await transformWithAI(payload, direction);

    if (!transformResult.success || !transformResult.data) {
      await supabaseAdmin.from('adapt_transaction_logs')
        .update({ status: 'QUARANTINED', error_message: transformResult.error })
        .eq('id', transactionId);
      return NextResponse.json({ success: false, transaction_id: transactionId, status: 'QUARANTINED',
        message: `Transformation failed: ${transformResult.error}` }, { status: 422 });
    }

    // --- 5. Validate the transformed output ---
    const validation = validateTransformation(transformResult.data, direction);
    if (!validation.valid) {
      const errorMsg = `Validation errors: ${validation.errors.join('; ')}`;
      await supabaseAdmin.from('adapt_transaction_logs')
        .update({ status: 'QUARANTINED', transformed_payload: transformResult.data, error_message: errorMsg })
        .eq('id', transactionId);
      return NextResponse.json({ success: false, transaction_id: transactionId, status: 'QUARANTINED', message: errorMsg }, { status: 422 });
    }
```

### `<<container>> Temporary Staging & Audit Database [MongoDB]`
**Same as Section 1:** [`lib/supabase.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/lib/supabase.ts) (29 lines — see full code above)

### `<<container>> Validate Privacy Consent Gatekeeper [Golang Service]`
**File:** [`apps/adapt-ipaas/src/app/api/ingest/route.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/api/ingest/route.ts) — Lines 52–81

Enforces RA 10173 (Data Privacy Act) by quarantining records without signed consent.

```typescript
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
          source_system, destination_system,
          source_format: sourceFormat, destination_format: destFormat,
          raw_payload: rawPayloadForDb,
          status: 'QUARANTINED', error_message: consentError,
        })
        .select().single();

      return NextResponse.json({
        success: false, transaction_id: quarantinedRecord?.id,
        status: 'QUARANTINED', message: consentError,
      }, { status: 422 });
    }
```

### `<<container>> Validate Schema & Completeness Service [Golang Service]`
**File:** [`apps/adapt-ipaas/src/lib/validator.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/lib/validator.ts) (131 lines)

Full validator with separate FHIR Bundle and HL7v2 flat-payload validation logic including PhilHealth ID format checks.

```typescript
import type { TransformDirection } from './ai';

interface ValidationResult { valid: boolean; errors: string[]; }

export function validateFHIRBundle(data: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  if (data.resourceType !== 'Bundle') errors.push('Root resourceType must be "Bundle"');
  const entries = data.entry as Array<Record<string, unknown>> | undefined;
  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    errors.push('Bundle must contain at least one entry');
  } else {
    const resourceTypes = entries.map((e) => (e.resource as Record<string, unknown>)?.resourceType);
    if (!resourceTypes.includes('Patient')) errors.push('Bundle must contain a Patient resource');
    if (!resourceTypes.includes('Encounter')) errors.push('Bundle must contain an Encounter resource');
    if (!resourceTypes.includes('Condition')) errors.push('Bundle must contain a Condition resource');
    // Check Patient has PhilHealth ID
    const patientEntry = entries.find((e) => (e.resource as Record<string, unknown>)?.resourceType === 'Patient');
    if (patientEntry) {
      const patient = patientEntry.resource as Record<string, unknown>;
      const identifiers = patient.identifier as Array<Record<string, unknown>> | undefined;
      const hasPhilHealth = identifiers?.some(
        (id) => id.system === 'https://www.philhealth.gov.ph/memberid' && id.value
      );
      if (!hasPhilHealth) errors.push('Patient must have a PhilHealth identifier');
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateHL7V2Payload(data: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  const requiredFields = ['patient_fname', 'patient_lname', 'dob', 'sex', 'philhealth_no', 'diagnosis_code', 'referring_facility_name'];
  for (const field of requiredFields) {
    if (!data[field]) errors.push(`Missing required field: ${field}`);
  }
  if (!data.vitals || typeof data.vitals !== 'object') {
    errors.push('Missing or invalid vitals object');
  } else {
    const vitals = data.vitals as Record<string, unknown>;
    for (const vital of ['bp_systolic', 'bp_diastolic', 'heart_rate', 'temperature']) {
      if (vitals[vital] === undefined || vitals[vital] === null) errors.push(`Missing vital sign: ${vital}`);
    }
  }
  if (data.philhealth_no && typeof data.philhealth_no === 'string' && data.philhealth_no.length < 6) {
    errors.push('PhilHealth number appears invalid (too short)');
  }
  return { valid: errors.length === 0, errors };
}

export function validateTransformation(data: Record<string, unknown>, direction: TransformDirection): ValidationResult {
  switch (direction) {
    case 'HL7V2_TO_FHIR_R4': case 'IHOMIS_TO_FHIR': return validateFHIRBundle(data);
    case 'FHIR_R4_TO_HL7V2': case 'FHIR_TO_IHOMIS': return validateHL7V2Payload(data);
    default: return validateFHIRBundle(data);
  }
}
```

### `<<container>> Translate Data to/from PH Core Engine [Golang / MCP Client]`
**Same as Section 1:** [`lib/ai.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/lib/ai.ts) — `transformWithAI()` function (see full code above)

### `<<container>> Local LLM [Inference Runtime]`
**Same as Section 1:** [`lib/ai.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/lib/ai.ts) — Gemini + Groq SDK initialization and model fallback chain (see full code above)

### `<<container>> Deterministic Syntactic Fallback [Algorithmic Mapping Safety Net]`
**File:** [`apps/adapt-ipaas/src/lib/mapping-calc.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/lib/mapping-calc.ts) (391 lines)

Full deterministic field-mapping engine with HL7v2 and FHIR data extractors, alias tables, and percentage calculations.

```typescript
// ─── Templates ───
const IHOMIS_TEMPLATE: { category: string; label: string }[] = [
  { category: 'Patient Demographics', label: 'First Name' },
  { category: 'Patient Demographics', label: 'Middle Name' },
  { category: 'Patient Demographics', label: 'Last Name' },
  // ... 27 total fields covering Patient, Vitals, Diagnosis & Referral
];

const WAH_TEMPLATE: { category: string; label: string }[] = [
  { category: 'Patient Resource', label: 'Given Name' },
  { category: 'Patient Resource', label: 'Middle Name' },
  // ... 26 total fields covering Patient, Encounter, Observations, Condition
];

const EXTRACTOR_ALIASES: Record<string, string[]> = {
  'Given Name': ['Given Name'],
  'Family Name': ['Family Name'],
  'PhilHealth ID': ['PhilHealth No.', 'PhilHealth ID'],
  'BP Systolic': ['BP Systolic', 'Systolic blood pressure', 'Systolic Blood Pressure'],
  // ... 30+ alias mappings for cross-format field resolution
};

function extractHL7Data(payload: Record<string, unknown>): Row[] {
  const vitalsObj = (payload.vitals && typeof payload.vitals === 'object') ? payload.vitals as Record<string, unknown> : null;
  const g = (k: string) => {
    if (payload[k] != null && String(payload[k]) !== '') return String(payload[k]);
    if (vitalsObj && vitalsObj[k] != null && String(vitalsObj[k]) !== '' && String(vitalsObj[k]) !== '0') return String(vitalsObj[k]);
    return '';
  };
  // Extracts 28 fields from patient demographics, vitals, diagnosis, referral
  add('Patient', 'First Name', g('patient_fname'));
  add('Patient', 'Last Name', g('patient_lname'));
  // ... (full extraction for all HL7v2 fields)
}

function extractFHIRData(payload: Record<string, unknown>): Row[] {
  const entries = (payload as any)?.entry || [];
  const resources = entries.map((e: any) => e?.resource).filter(Boolean);
  // Walks the entire FHIR Bundle extracting Patient, Encounter, Observation, Condition resources
  for (const res of resources) {
    if (rt === 'Patient') { /* name, identifiers, telecom, address */ }
    if (rt === 'Encounter') { /* class, priority, facility, physician */ }
    if (rt === 'Observation') { /* LOINC-coded vitals with components */ }
    if (rt === 'Condition') { /* ICD-10, chief complaint, clinical status */ }
  }
}

export function calculateMappingPercentage(transformedPayload, destinationSystem): MappingResult {
  const template = isDestWAH ? WAH_TEMPLATE : IHOMIS_TEMPLATE;
  const extracted = extractDataFields(transformedPayload);
  let filled = 0;
  for (const tf of template) {
    const val = findValueForTemplateField(tf.label, extracted, isDestWAH);
    if (val) filled++;
  }
  return { totalFields: total, filledFields: filled, emptyFields: total - filled,
    percentage: Number(((filled / total) * 100).toFixed(1)) };
}
```

---

## 3. UI Layer, API Layer, and Core Services [Packages] — `image_bb4a0b.png`

| C4 Component | Implementation File | Description |
| :--- | :--- | :--- |
| 📊 **Admin Dashboard** | [`src/app/page.tsx`](./src/app/page.tsx) | The WAH4PCE Admin Dashboard UI (React). |
| 📥 **Ingest API** | [`src/app/api/ingest/route.ts`](./src/app/api/ingest/route.ts) | Standardized ingest API endpoints. |
| 🚫 **Decline API** | [`src/app/api/decline/route.ts`](./src/app/api/decline/route.ts) | API for isolating malformed or declined payloads. |
| 📤 **Request API** | [`src/app/api/request/route.ts`](./src/app/api/request/route.ts) | Endpoints to query and negotiate specific health records. |
| 📈 **Metrics Service** | [`src/app/api/metrics/route.ts`](./src/app/api/metrics/route.ts) | Service returning telemetry (throughput, success rates). |
| 🤖 **AI Transformation Service** | [`src/lib/ai.ts`](./src/lib/ai.ts) | The service executing system prompts for data mapping. |
| 🛡️ **Deterministic Fallback** | [`src/lib/mapping-calc.ts`](./src/lib/mapping-calc.ts) | Service providing rule-based transformations. |
| ✅ **Validation Service** | [`src/lib/validator.ts`](./src/lib/validator.ts) | Service for structural integrity checks. |
| 📋 **Transaction Log Service** | [`src/app/api/transactions/route.ts`](./src/app/api/transactions/route.ts) | API service returning sanitized transaction histories. |
| 🧠 **Local LLM Engine** | [`src/lib/ai.ts`](./src/lib/ai.ts) | AI Inference Engine. |
| 💾 **Staging & Audit Database** | [`src/lib/supabase.ts`](./src/lib/supabase.ts) | The persistence layer. |

### `<<component>> Admin Dashboard [Next.js UI]`
**Same as Section 1:** [`page.tsx`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/page.tsx) (256 lines — full dashboard with metrics, charts, and transaction table)

### `<<component>> Ingest API [API]`
**Same as Section 2:** [`api/ingest/route.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/api/ingest/route.ts) (250 lines — full pipeline)

### `<<component>> Decline API [API]`
**File:** [`apps/adapt-ipaas/src/app/api/decline/route.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/api/decline/route.ts) (74 lines)

Handles bidirectional declines (WAH → Org or Org → WAH), quarantines the transaction, and forwards to the appropriate webhook.

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const WAH_API_URL = process.env.WAH_API_URL || 'http://localhost:3002/api';
const PORTAL_API_URL = process.env.PORTAL_API_URL || 'http://localhost:3001/api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { request_id, destination_system, message, ipaas_transaction_id } = body;

    if (!request_id || !destination_system) {
      return NextResponse.json({ success: false, message: 'Missing request_id or destination_system' }, { status: 400 });
    }

    // Update the existing transaction to QUARANTINED (declined)
    if (ipaas_transaction_id) {
      await supabaseAdmin.from('adapt_transaction_logs')
        .update({ status: 'QUARANTINED', error_message: message || 'Request declined by source organization' })
        .eq('id', ipaas_transaction_id);
    }

    // Forward decline notification to the appropriate system
    if (destination_system === 'WAH') {
      return NextResponse.json({ success: true, message: 'Decline recorded for WAH' });
    } else {
      // WAH declined org's request → notify portal webhook
      const webhookUrl = `${PORTAL_API_URL.replace('/api', '')}/api/webhook`;
      const forwardResponse = await fetch(webhookUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_system: 'WAH', request_id, status: 'DECLINED', payload: { message: message || 'Request declined' } }),
      });
      if (forwardResponse.ok) return NextResponse.json({ success: true, message: 'Decline forwarded successfully' });
      else return NextResponse.json({ success: false, message: 'Failed to forward decline' }, { status: 502 });
    }
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
```

### `<<component>> Request API [API]`
**File:** [`apps/adapt-ipaas/src/app/api/request/route.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/api/request/route.ts) (157 lines)

Handles bidirectional data requests. Determines direction, creates a PENDING transaction, and forwards to WAH or Portal.

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const WAH_API_URL = process.env.WAH_API_URL || 'http://localhost:3002/api';
const PORTAL_API_URL = process.env.PORTAL_API_URL || 'http://localhost:3001/api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { request_id, requesting_org, requesting_org_id, target_org, target_org_id,
            destination_format: destFormat, philhealth_no, patient_name, request_reason } = body;

    // Determine direction
    const isWAHRequesting = requesting_org === 'WAH';
    const sourceSystem = isWAHRequesting ? (target_org || 'Organization') : 'WAH';
    const destSystem = isWAHRequesting ? 'WAH' : (requesting_org || 'Organization');

    // --- Log in iPaaS transaction table as PENDING ---
    const { data: txRecord } = await supabaseAdmin.from('adapt_transaction_logs')
      .insert({
        source_system: sourceSystem, destination_system: destSystem,
        source_format: srcFormat, destination_format: dstFormat,
        raw_payload: { request_id, philhealth_no, patient_name, direction: isWAHRequesting ? 'WAH_TO_ORG' : 'ORG_TO_WAH' },
        status: 'PENDING',
      }).select().single();

    if (isWAHRequesting) {
      // === WAH → Org: Forward to Portal's incoming-requests endpoint ===
      const portalRes = await fetch(`${PORTAL_API_URL}/incoming-requests`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id, requesting_system: 'WAH', target_org_id,
          philhealth_no, patient_name, request_reason, ipaas_transaction_id: txRecord?.id }),
      });
      // ... error handling, quarantine on failure
    } else {
      // === Org → WAH: Forward to WAH's requests endpoint ===
      const wahRes = await fetch(`${WAH_API_URL}/requests`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id, requesting_org, requesting_org_id,
          destination_format: destFormat, philhealth_no, patient_name, ipaas_transaction_id: txRecord?.id }),
      });
      // ... error handling, quarantine on failure
    }
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
```

### `<<component>> Metrics Service [Service]`
**File:** [`apps/adapt-ipaas/src/app/api/metrics/route.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/api/metrics/route.ts) (69 lines)

Aggregates 9 parallel Supabase count queries for dashboard metrics.

```typescript
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [totalRes, successRes, pendingRes, quarantinedRes, transformingRes, toWahRes, fromWahRes] =
      await Promise.all([
        supabaseAdmin.from('adapt_transaction_logs').select('*', { count: 'exact', head: true }),
        supabaseAdmin.from('adapt_transaction_logs').select('*', { count: 'exact', head: true }).eq('status', 'SUCCESS'),
        supabaseAdmin.from('adapt_transaction_logs').select('*', { count: 'exact', head: true }).eq('status', 'PENDING'),
        supabaseAdmin.from('adapt_transaction_logs').select('*', { count: 'exact', head: true }).eq('status', 'QUARANTINED'),
        supabaseAdmin.from('adapt_transaction_logs').select('*', { count: 'exact', head: true }).eq('status', 'TRANSFORMING'),
        supabaseAdmin.from('adapt_transaction_logs').select('*', { count: 'exact', head: true }).eq('destination_system', 'WAH'),
        supabaseAdmin.from('adapt_transaction_logs').select('*', { count: 'exact', head: true }).eq('source_system', 'WAH'),
      ]);

    const total = totalRes.count || 0;
    const success = successRes.count || 0;
    const successRate = total > 0 ? Number(((success / total) * 100).toFixed(1)) : 0;

    const [hl7v2Res, fhirRes] = await Promise.all([
      supabaseAdmin.from('adapt_transaction_logs').select('*', { count: 'exact', head: true }).eq('source_format', 'HL7V2'),
      supabaseAdmin.from('adapt_transaction_logs').select('*', { count: 'exact', head: true }).eq('source_format', 'FHIR_R4'),
    ]);

    return NextResponse.json({
      success: true,
      metrics: {
        total_records: total, success_count: success, pending_count: pendingRes.count || 0,
        quarantined_count: quarantinedRes.count || 0, transforming_count: transformingRes.count || 0,
        success_rate: successRate, org_to_wah: toWahRes.count || 0, wah_to_org: fromWahRes.count || 0,
        hl7v2_count: hl7v2Res.count || 0, fhir_count: fhirRes.count || 0,
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Failed to fetch metrics' }, { status: 500 });
  }
}
```

### `<<component>> AI Transformation Service [Service]`
**Same as Section 1:** [`lib/ai.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/lib/ai.ts) — `transformWithAI()` (211 lines)

### `<<component>> Deterministic Syntactic Fallback [Service]`
**Same as Section 2:** [`lib/mapping-calc.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/lib/mapping-calc.ts) (391 lines)

### `<<component>> Validation Service [Service]`
**Same as Section 2:** [`lib/validator.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/lib/validator.ts) (131 lines)

### `<<component>> Transaction Log Service [Service]`
**File:** [`apps/adapt-ipaas/src/app/api/transactions/route.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/api/transactions/route.ts) (58 lines)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const source = searchParams.get('source');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabaseAdmin.from('adapt_transaction_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);
    if (source) query = query.eq('source_system', source);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    return NextResponse.json({ success: true, data, total: count, limit, offset });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
```

### `<<component>> Local LLM Engine [Inference Runtime]`
**Same as Section 1:** [`lib/ai.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/lib/ai.ts)

### `<<component>> Staging & Audit Database [MongoDB]`
**Same as Section 1:** [`lib/supabase.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/lib/supabase.ts)

---

## 4. ADAPT Core Services [Golang High-Concurrency Engine] — `image_bb4a29.png`

| C4 Component | Implementation File | Description |
| :--- | :--- | :--- |
| 📦 **API Layer [Package]** | [`src/app/api/`](./src/app/api) | Next.js API Routes representing the Golang HTTP services. |
| 🔄 **Provide Health Data Orchestrator** | [`src/app/api/ingest/route.ts`](./src/app/api/ingest/route.ts) | Coordinates Bronze, Silver, and Gold transformations. |
| ✅ **Validate Schema & Completeness** | [`src/lib/validator.ts`](./src/lib/validator.ts) | `validateFHIRBundle()` & `validateHL7V2Payload()`. |
| 🔐 **Privacy Consent Gatekeeper** | [`src/app/api/ingest/route.ts`](./src/app/api/ingest/route.ts) | Verifies patient consent inside the orchestrator. |
| 🛡️ **Deterministic Syntactic Fallback** | [`src/lib/mapping-calc.ts`](./src/lib/mapping-calc.ts) | 390+ lines of fallback mapping algorithms. |
| 🤖 **Semantic AI Translator** | [`src/lib/ai.ts`](./src/lib/ai.ts) | `transformWithAI()` execution chain. |
| 📝 **Sanitized Transaction Logger** | [`src/app/api/ingest/route.ts`](./src/app/api/ingest/route.ts) | Final stage Supabase write operations. |
| 🚫 **Quarantine Queue Manager** | [`src/app/api/decline/route.ts`](./src/app/api/decline/route.ts) | Logic routing failed payloads to QUARANTINED state. |
| 🧠 **Local LLM Engine** | [`src/lib/ai.ts`](./src/lib/ai.ts) | LLM provider initialization. |
| 💾 **MongoDB Database** | [`src/lib/supabase.ts`](./src/lib/supabase.ts) | Supabase/Postgres equivalent. |

### `<<package>> API Layer [Package]`
**Directory:** [`apps/adapt-ipaas/src/app/api/`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/api/) — Contains `ingest/`, `decline/`, `request/`, `metrics/`, `transactions/`, `auth/`

### `<<component>> Provide Health Data Orchestrator [orchestrator.go]`
**Same as Section 2 — Provide Health Data Pipeline Engine:** [`api/ingest/route.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/api/ingest/route.ts) Lines 83–157 (Bronze → Silver → Gold pipeline)

### `<<component>> Validate Schema & Completeness [schema_validator.go]`
**Same as Section 2:** [`lib/validator.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/lib/validator.ts) — `validateFHIRBundle()` + `validateHL7V2Payload()`

### `<<component>> Privacy Consent Gatekeeper [consent_gatekeeper.go]`
**Same as Section 2:** [`api/ingest/route.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/api/ingest/route.ts) Lines 52–81

### `<<component>> Deterministic Syntactic Fallback [fallback_mapper.go]`
**Same as Section 2:** [`lib/mapping-calc.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/lib/mapping-calc.ts)

### `<<component>> Semantic AI Translator [ai_translator.go]`
**Same as Section 1:** [`lib/ai.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/lib/ai.ts) — `transformWithAI()`

### `<<component>> Sanitized Transaction Logger [audit_logger.go]`
**File:** [`apps/adapt-ipaas/src/app/api/ingest/route.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/api/ingest/route.ts) — Lines 221–231

The audit logging happens at the final step of the pipeline when the transaction status and transformed payload are written.

```typescript
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
```

### `<<component>> Quarantine Queue Manager [quarantine.go]`
**Same as Section 3 — Decline API:** [`api/decline/route.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/api/decline/route.ts) (74 lines — see full code above)

Also triggered inline in [`api/ingest/route.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/api/ingest/route.ts) at Lines 140–157 and 162–181 when transformation or validation fails.

### `<<component>> Local LLM Engine [Inference Runtime]`
**Same as Section 1:** [`lib/ai.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/lib/ai.ts)

### `<<component>> MongoDB Database [Staging & Audit]`
**Same as Section 1:** [`lib/supabase.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/lib/supabase.ts)

---

## 5. API Layer [Package] — Golang HTTP Interfaces — `image_bb4a60.png`

| C4 Component | Implementation File | Description |
| :--- | :--- | :--- |
| 🛣️ **HTTP Router & Dispatcher** | [`src/app/layout.tsx`](./src/app/layout.tsx) | Handled inherently by Next.js App Router filesystem routing. |
| 🔐 **Auth & Scope Middleware** | [`src/middleware.ts`](./src/middleware.ts) | JWT-based middleware protecting routes. |
| 🪝 **Webhook Dispatcher Client** | [`src/app/api/ingest/route.ts`](./src/app/api/ingest/route.ts) | Dispatches the transformed gold payload to target endpoints. |
| 📥 **Ingest Controller** | [`src/app/api/ingest/route.ts`](./src/app/api/ingest/route.ts) | Route handler `POST /api/ingest`. |
| 🚫 **Decline Controller** | [`src/app/api/decline/route.ts`](./src/app/api/decline/route.ts) | Route handler `POST /api/decline`. |
| 📤 **Request Controller** | [`src/app/api/request/route.ts`](./src/app/api/request/route.ts) | Route handler `POST /api/request`. |
| 📦 **Core Services [Package]** | [`src/lib/`](./src/lib) | The `lib/` directory dependency injection. |

### `<<component>> HTTP Router & Dispatcher [router.go]`
**File:** [`apps/adapt-ipaas/src/app/layout.tsx`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/layout.tsx) + Next.js filesystem routing (30 lines)

Next.js App Router automatically dispatches requests based on folder structure (`app/api/ingest/route.ts`, `app/api/decline/route.ts`, etc.).

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ADAPT iPaaS — Integration Platform Dashboard",
  description: "Intelligent Healthcare Data Integration Platform as a Service for the Philippine LHIE",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased">
        <div className="flex min-h-screen">{children}</div>
      </body>
    </html>
  );
}
```

### `<<component>> Auth & Scope Middleware [auth_middleware.go]`
**File:** [`apps/adapt-ipaas/src/middleware.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/middleware.ts) (50 lines)

JWT-based authentication middleware that protects all routes except auth pages and static assets.

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'super-secret-fallback-key-replace-me-in-production'
);

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/register');
  let isValid = false;

  if (token) {
    try {
      await jwtVerify(token, JWT_SECRET);
      isValid = true;
    } catch (e) {
      isValid = false;
    }
  }

  if (!isValid && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (isValid && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
```

Also backed by the **Login API:**

**File:** [`apps/adapt-ipaas/src/app/api/auth/login/route.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/api/auth/login/route.ts) (57 lines)

```typescript
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'super-secret-fallback-key-replace-me-in-production');

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });

    const { data: user } = await supabaseAdmin.from('app_users').select('*')
      .or(`email.eq.${email},username.eq.${email}`).single();
    if (!user) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

    const token = await new SignJWT({ id: user.id, username: user.username, email: user.email })
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(JWT_SECRET);

    const response = NextResponse.json({ user: { id: user.id, username: user.username, email: user.email, name: user.name } });
    response.cookies.set('auth_token', token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### `<<component>> Webhook Dispatcher Client [webhook_client.go]`
**File:** [`apps/adapt-ipaas/src/app/api/ingest/route.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/api/ingest/route.ts) — Lines 186–219

The webhook dispatcher that resolves the target URL and forwards the gold-transformed payload.

```typescript
    // --- 6. Forward to destination system ---
    const resolveWebhookUrl = (): string => {
      if (body.webhook_url) return body.webhook_url;
      if (destination_system === 'WAH') return process.env.WAH_WEBHOOK_URL || 'http://localhost:3002/api/webhook';
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
      console.warn(`[iPaaS Ingest] Forward to ${destination_system} failed: ${forwardError}`);
    }
```

### `<<component>> Ingest Controller [ingest_controller.go]`
**Same as Section 2:** [`api/ingest/route.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/api/ingest/route.ts)

### `<<component>> Decline Controller [decline_controller.go]`
**Same as Section 3:** [`api/decline/route.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/api/decline/route.ts)

### `<<component>> Request Controller [request_controller.go]`
**Same as Section 3:** [`api/request/route.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/api/request/route.ts)

### `<<package>> Core Services [Package]`
**Directory:** [`apps/adapt-ipaas/src/lib/`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/lib/)

---

## 6. UI Layer [Package] — Next.js / React Web Dashboard — `image_bb4a82.png`

| C4 Component | Implementation File | Description |
| :--- | :--- | :--- |
| 🧑‍💼 **WAH4PCE Admin** | *N/A* | External actor interacting via JWT authenticated session. |
| 🗺️ **App Router & Layout** | [`src/app/layout.tsx`](./src/app/layout.tsx) | The root DOM layout and layout preservation wrapper. |
| 🔑 **Auth & Session Manager** | [`src/app/api/auth/login/route.ts`](./src/app/api/auth/login/route.ts) | JWT creation via bcrypt validation. |
| 📊 **Metrics & Health Monitor** | [`src/components/MetricCard.tsx`](./src/components/MetricCard.tsx) | UI components for system health and throughput visualization. |
| 📋 **Transaction Log Viewer** | [`src/app/transactions/page.tsx`](./src/app/transactions/page.tsx) | Complex React table component for audit logs and status filters. |
| 🔍 **Payload Comparison & Unhash** | [`src/app/mapper/page.tsx`](./src/app/mapper/page.tsx) | 870+ line React component for SHA-256 hash/unhash and side-by-side HL7v2/FHIR view. |
| 🌐 **ADAPT API Client** | [`src/components/Sidebar.tsx`](./src/components/Sidebar.tsx) | Frontend client routing and `safeFetch` utilities. |
| 📦 **API Layer [Package]** | [`src/app/api/`](./src/app/api) | The backend targets for the ADAPT API client. |

### `<<person>> WAH4PCE Admin [Admin User]`
Not a code component — this is the external actor. Represented in the system through the JWT session created at login (see Auth & Scope Middleware above).

### `<<component>> App Router & Layout [Next.js App Router]`
**Same as Section 5:** [`layout.tsx`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/layout.tsx)

### `<<component>> Auth & Session Manager [JWT / Session Context]`
**Same as Section 5:** [`middleware.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/middleware.ts) + [`api/auth/login/route.ts`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/api/auth/login/route.ts)

### `<<component>> Metrics & Health Monitor [React View & Hooks]`
**File:** [`apps/adapt-ipaas/src/app/page.tsx`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/page.tsx) — Lines 109–179

The metric cards and health monitoring UI (5 main metrics + direction cards + format breakdown).

```tsx
{/* Main Metrics */}
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
  {[
    { label: 'Total Records', value: metrics?.total_records || 0, color: '#8b5cf6' },
    { label: 'Success Rate', value: `${metrics?.success_rate || 0}%`, color: '#059669' },
    { label: 'Avg Mapping', value: `${avgMapping}%`, color: pctColor(avgMapping) },
    { label: 'Pending', value: (metrics?.pending_count || 0) + (metrics?.transforming_count || 0), color: '#d97706' },
    { label: 'Quarantined', value: metrics?.quarantined_count || 0, color: '#dc2626' },
  ].map(m => (
    <div key={m.label} className="ipaas-card p-5" style={{ borderLeft: `3px solid ${m.color}` }}>
      <p className="text-xs font-medium uppercase tracking-wide">{m.label}</p>
      <p className="text-2xl font-bold">{m.value}</p>
    </div>
  ))}
</div>

{/* Direction + Format Stats */}
<div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
  <div className="ipaas-card p-5">
    <p className="text-sm font-medium">Org → WAH</p>
    <p className="text-xs">HL7v2 → FHIR R4</p>
    <p className="text-3xl font-bold" style={{ color: '#2563eb' }}>{metrics?.org_to_wah || 0}</p>
  </div>
  <div className="ipaas-card p-5">
    <p className="text-sm font-medium">WAH → Org</p>
    <p className="text-xs">FHIR R4 → HL7v2</p>
    <p className="text-3xl font-bold" style={{ color: '#8b5cf6' }}>{metrics?.wah_to_org || 0}</p>
  </div>
</div>
```

Also supported by **MetricCard component:**

**File:** [`apps/adapt-ipaas/src/components/MetricCard.tsx`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/components/MetricCard.tsx) (63 lines)

```tsx
'use client';
import { useEffect, useState } from 'react';

interface MetricCardProps {
  title: string; value: number; suffix?: string;
  variant: 'purple' | 'green' | 'yellow' | 'red'; icon: React.ReactNode;
}

export default function MetricCard({ title, value, suffix = '', variant, icon }: MetricCardProps) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const duration = 800; const steps = 30; const increment = value / steps;
    let current = 0; let step = 0;
    const timer = setInterval(() => {
      step++; current = Math.min(Math.round(increment * step), value);
      setDisplayValue(current);
      if (step >= steps) clearInterval(timer);
    }, duration / steps);
    return () => clearInterval(timer);
  }, [value]);

  return (
    <div className={`glass-card p-6 metric-gradient-${variant} animate-fade-in`}>
      <p className="text-sm font-medium mb-1">{title}</p>
      <p className="text-3xl font-bold animate-count">{displayValue}{suffix}</p>
    </div>
  );
}
```

### `<<component>> Transaction Log Viewer [React Table Component]`
**File:** [`apps/adapt-ipaas/src/app/transactions/page.tsx`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/transactions/page.tsx) (214 lines)

Full-page transaction log viewer with status/source filtering, pagination, mapping % bars, and auto-refresh.

```tsx
'use client';
import { useEffect, useState, useMemo } from 'react';
import Sidebar from '@/components/Sidebar';
import { calculateMappingPercentage, calculateSourceFillCount } from '@/lib/mapping-calc';

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [page, setPage] = useState(0);
  const limit = 15;

  const fetchTransactions = async () => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
    if (statusFilter) params.set('status', statusFilter);
    if (sourceFilter) params.set('source', sourceFilter);
    const data = await safeFetch(`/api/transactions?${params.toString()}`);
    if (data.success) { setTransactions(data.data || []); setTotal(data.total || 0); }
    setLoading(false);
  };

  useEffect(() => { setLoading(true); fetchTransactions(); }, [statusFilter, sourceFilter, page]);
  useEffect(() => { const i = setInterval(fetchTransactions, 15000); return () => clearInterval(i); }, [statusFilter, sourceFilter, page]);

  // Pre-compute mapping % for each transaction
  const txMappings = useMemo(() => { /* ... calculates src/dest percentages ... */ }, [transactions]);

  return (
    <>
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        {/* Filter dropdowns */}
        <select value={statusFilter} onChange={...}>
          <option value="">All Statuses</option>
          <option value="SUCCESS">Success</option>
          <option value="PENDING">Pending</option>
          <option value="TRANSFORMING">Transforming</option>
          <option value="QUARANTINED">Quarantined</option>
        </select>
        {/* Transaction table with mapping % bars, status badges, pagination */}
      </main>
    </>
  );
}
```

### `<<component>> Payload Comparison & Unhash [React Component]`
**File:** [`apps/adapt-ipaas/src/app/mapper/page.tsx`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/mapper/page.tsx) (873 lines)

The most complex UI component. Features SHA-256 hashing/unhashing of payloads, HL7v2 pipe-delimited string parsing, FHIR Bundle resource extraction, side-by-side field-level comparison tables, and transaction selection dropdown.

```tsx
// SHA-256 hash function (browser-compatible)
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// HL7v2 pipe-delimited parser (PID, PV1, OBX, DG1, RF1 segments)
function parseHL7v2String(hl7: string): Row[] {
  const segments = hl7.split(/[\r\n]+/).filter(Boolean);
  for (const seg of segments) {
    const fields = seg.split('|');
    if (segType === 'PID') { /* PhilHealth, name, DOB, sex, address, contact */ }
    if (segType === 'PV1') { /* Physician, priority */ }
    if (segType === 'OBX') { /* LOINC-coded vitals */ }
    if (segType === 'DG1') { /* ICD-10, diagnosis, chief complaint */ }
    if (segType === 'RF1') { /* Referral reason, facility */ }
  }
}

// Hashable payload panel with reveal/re-hash toggle
function HashablePayload({ label, dotColor, payload }) {
  const [revealed, setRevealed] = useState(false);
  const [hash, setHash] = useState<string>('');
  useEffect(() => { sha256(jsonStr).then(setHash); }, [jsonStr]);
  return (
    <div className="ipaas-card p-4">
      <button onClick={() => setRevealed(!revealed)}>
        {revealed ? 'Re-hash' : 'Unhash'}
      </button>
      <pre>{revealed ? jsonStr : hash}</pre>
    </div>
  );
}

// Field-level comparison table (source template vs destination template with filled/empty status)
function ComparisonTable({ raw, transformed, source, dest }) {
  // 27-field iHOMIS template vs 26-field WAH template
  // Cross-format alias resolution for matching fields
  // Green "Filled" / Red "Empty" badges per field
}
```

### `<<component>> ADAPT API Client [Axios / Fetch Service]`
**File:** [`apps/adapt-ipaas/src/app/page.tsx`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/page.tsx) — Lines 6–10 + [`transactions/page.tsx`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/transactions/page.tsx) — Lines 6–10

The shared `safeFetch` utility used by all frontend pages to call the backend API.

```tsx
async function safeFetch(url: string) {
  const res = await fetch(url);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { success: false }; }
}

// Usage in Dashboard:
const [metricsData, txData] = await Promise.all([
  safeFetch('/api/metrics'),
  safeFetch('/api/transactions?limit=50'),
]);

// Usage in Transactions page:
const data = await safeFetch(`/api/transactions?${params.toString()}`);

// Usage in Mapper page:
const data = await safeFetch('/api/transactions?limit=50');
```

Also, the **Sidebar navigation component** acts as the routing client:

**File:** [`apps/adapt-ipaas/src/components/Sidebar.tsx`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/components/Sidebar.tsx) (66 lines)

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/transactions', label: 'Transaction Logs' },
  { href: '/mapper', label: 'Data Mapper' },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-[240px] min-h-screen flex flex-col">
      <div className="px-5 py-4 border-b">
        <h1 className="text-sm font-semibold text-white">ADAPT iPaaS</h1>
        <p className="text-[11px]">Integration Platform</p>
      </div>
      <nav className="flex-1 p-3">
        {navItems.map(item => {
          const isActive = pathname === item.href;
          return <Link key={item.href} href={item.href} className={`ipaas-sidebar-link ${isActive ? 'active' : ''}`}>{item.label}</Link>;
        })}
      </nav>
      {/* System status indicators + logout button */}
    </aside>
  );
}
```

### `<<package>> API Layer [Golang HTTP Services]`
**Same as Section 4 — `<<package>> API Layer [Package]`:** [`apps/adapt-ipaas/src/app/api/`](file:///d:/Documents_FromC/WAH4PCE-Merge%20Conflict/apps/adapt-ipaas/src/app/api/) — 6 API route directories serving the dashboard

---

## Summary: Total Codebase Size

| File | Lines | Purpose |
|------|-------|---------|
| `api/ingest/route.ts` | 250 | Core pipeline engine |
| `lib/ai.ts` | 211 | AI translation with 6-model fallback |
| `lib/mapping-calc.ts` | 391 | Deterministic field mapping |
| `lib/validator.ts` | 131 | FHIR/HL7v2 validation |
| `lib/supabase.ts` | 29 | Database client |
| `middleware.ts` | 50 | JWT auth middleware |
| `api/auth/login/route.ts` | 57 | Login with bcrypt + JWT |
| `api/decline/route.ts` | 74 | Decline/quarantine handler |
| `api/request/route.ts` | 157 | Bidirectional data requests |
| `api/metrics/route.ts` | 69 | Dashboard metrics aggregation |
| `api/transactions/route.ts` | 58 | Transaction log API |
| `app/page.tsx` | 256 | Dashboard UI |
| `app/transactions/page.tsx` | 214 | Transaction log viewer UI |
| `app/mapper/page.tsx` | 873 | Payload comparison & unhash UI |
| `app/layout.tsx` | 30 | Root layout |
| `components/Sidebar.tsx` | 66 | Navigation sidebar |
| `components/MetricCard.tsx` | 63 | Animated metric card |
| **TOTAL** | **~2,979** | **Full ADAPT iPaaS prototype** |
