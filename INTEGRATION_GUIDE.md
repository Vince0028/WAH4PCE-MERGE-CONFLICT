# ADAPT iPaaS — External Integration Guide

> **For teams building a WAH Hospital system that needs to connect to our ADAPT iPaaS middleware.**
>
> This guide explains how to send patient data from your WAH Hospital system to the iPaaS, have it AI-transformed into HL7v2 format, and delivered to the iHOMIS dummy system — and vice versa.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [API Base URL](#api-base-url)
4. [Endpoint Reference](#endpoint-reference)
   - [POST /api/ingest](#1-post-apiingest--send-patient-data)
   - [POST /api/request](#2-post-apirequest--request-patient-data)
   - [POST /api/decline](#3-post-apidecline--decline-a-request)
   - [GET /api/transactions](#4-get-apitransactions--view-transaction-logs)
5. [Data Formats](#data-formats)
6. [FHIR R4 Bundle Structure](#fhir-r4-bundle-structure)
7. [Webhook Setup (Receiving Data)](#webhook-setup-receiving-data)
8. [Complete Integration Examples](#complete-integration-examples)
9. [Consent & Data Privacy](#consent--data-privacy)
10. [Error Handling](#error-handling)
11. [Testing Checklist](#testing-checklist)

---

## Architecture Overview

```
┌──────────────────┐     FHIR R4 Bundle      ┌──────────────────┐     HL7v2 (flat JSON)     ┌──────────────────┐
│                  │  ──── POST /api/ingest ──>│                  │ ──── POST /api/webhook ──>│                  │
│  YOUR WAH App    │                           │   ADAPT iPaaS    │                           │  iHOMIS (Dummy)  │
│  (FHIR R4)       │  <── POST your webhook ──│   (AI Transform) │ <── POST /api/ingest ─────│  (HL7v2)         │
│                  │     transformed HL7v2     │                  │     HL7v2 pipe-delimited  │                  │
└──────────────────┘                           └──────────────────┘                           └──────────────────┘
         :3002                                          :3000                                         :3001
```

**Flow: WAH → iHOMIS (Your app sends data)**
1. Your app builds a **FHIR R4 Bundle** with patient data
2. You `POST` it to the iPaaS `/api/ingest` endpoint
3. The iPaaS uses **AI** to transform FHIR R4 → HL7v2 flat JSON
4. The iPaaS forwards the transformed data to iHOMIS's webhook

**Flow: iHOMIS → WAH (Your app receives data)**
1. iHOMIS sends HL7v2 data to the iPaaS `/api/ingest`
2. The iPaaS transforms HL7v2 → FHIR R4 Bundle
3. The iPaaS forwards the FHIR R4 Bundle to **your webhook** at `POST /api/webhook`

---

## Prerequisites

- Your WAH Hospital app running on a known port (default: `3002`)
- Network access to the iPaaS server (default: `http://localhost:3000`)
- A `/api/webhook` endpoint on your app to receive incoming transformed data

---

## API Base URL

| Environment | Base URL |
|---|---|
| Local Development | `http://localhost:3000/api` |
| Production (TBD) | Will be provided before testing |

---

## Endpoint Reference

### 1. `POST /api/ingest` — Send Patient Data

This is the **main endpoint** you will use. Send your FHIR R4 Bundle here and the iPaaS will transform it and forward it to the destination system.

#### Request Body

```json
{
  "source_system": "WAH",
  "destination_system": "iHOMIS",
  "source_format": "FHIR_R4",
  "destination_format": "HL7V2",
  "payload": { /* Your FHIR R4 Bundle — see structure below */ },
  "original_json": { /* Same as payload, kept for audit trail */ },
  "consent_signed": true,
  "webhook_url": "https://your-app.com/api/webhook"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `source_system` | string | ✅ | Your system name. Use `"WAH"` |
| `destination_system` | string | ✅ | Target system. Use `"iHOMIS"` for the dummy |
| `source_format` | string | ✅ | `"FHIR_R4"` (you send FHIR) |
| `destination_format` | string | ✅ | `"HL7V2"` (iHOMIS expects HL7v2) |
| `payload` | object | ✅ | The FHIR R4 Transaction Bundle |
| `original_json` | object | ❌ | Copy of payload for audit |
| `consent_signed` | boolean | ✅ | **Must be `true`**. Patient data privacy consent. Without this the record gets **QUARANTINED**. |
| `webhook_url` | string | ❌ | Optional. If set, iPaaS will forward the transformed result to this URL instead of the default. Useful if your app is hosted externally. |

#### Success Response (200)

```json
{
  "success": true,
  "transaction_id": "a1b2c3d4-...",
  "status": "SUCCESS",
  "message": "Data transformed (FHIR_R4→HL7V2) and forwarded successfully",
  "forwarded": true
}
```

#### Error Responses

| Status | Meaning |
|---|---|
| `400` | Missing required fields |
| `422` | QUARANTINED — consent missing, AI transform failed, or validation failed |
| `500` | Internal server error |

---

### 2. `POST /api/request` — Request Patient Data

Use this to **request** a patient record from iHOMIS (or have iHOMIS request from you).

#### Request Body (WAH requesting from iHOMIS)

```json
{
  "request_id": "unique-request-id",
  "requesting_org": "WAH",
  "target_org": "iHOMIS",
  "destination_format": "HL7V2",
  "philhealth_no": "0102-0304-0506",
  "patient_name": "Dela Cruz, Juan",
  "request_reason": "Follow-up consultation"
}
```

#### Success Response (200)

```json
{
  "success": true,
  "transaction_id": "a1b2c3d4-...",
  "message": "Request forwarded to iHOMIS for approval."
}
```

---

### 3. `POST /api/decline` — Decline a Request

If your system receives a data request and you want to decline it:

```json
{
  "request_id": "the-original-request-id",
  "destination_system": "iHOMIS",
  "message": "Patient record not found",
  "ipaas_transaction_id": "the-transaction-id-from-request"
}
```

---

### 4. `GET /api/transactions` — View Transaction Logs

Check the status of all transactions. Useful for debugging.

```
GET /api/transactions?status=SUCCESS&source=WAH&limit=10&offset=0
```

| Param | Description |
|---|---|
| `status` | Filter by: `SUCCESS`, `PENDING`, `TRANSFORMING`, `QUARANTINED` |
| `source` | Filter by source system name |
| `limit` | Max results (default 50) |
| `offset` | Pagination offset |

#### Response

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "source_system": "WAH",
      "destination_system": "iHOMIS",
      "source_format": "FHIR_R4",
      "destination_format": "HL7V2",
      "status": "SUCCESS",
      "raw_payload": { },
      "transformed_payload": { },
      "created_at": "2026-09-07T12:00:00Z"
    }
  ],
  "total": 1,
  "limit": 10,
  "offset": 0
}
```

---

## Data Formats

| System | Format | Description |
|---|---|---|
| **WAH Hospital** (you) | **FHIR R4** | PH Core FHIR R4 Transaction Bundle (JSON) |
| **iHOMIS** (dummy) | **HL7v2** | Pipe-delimited HL7v2 string OR flat JSON |

The iPaaS handles **all format conversion** automatically using AI. You only need to worry about sending valid FHIR R4.

---

## FHIR R4 Bundle Structure

Your FHIR R4 Bundle **must** contain these resources:

### Required Resources

| Resource | Purpose | Required Fields |
|---|---|---|
| **Patient** | Demographics | `name`, `gender`, `birthDate`, `identifier` (PhilHealth), `telecom` (phone), `address` |
| **Encounter** | Visit info | `class`, `priority`, `participant` (physician), `serviceProvider` (facility), `reasonCode` |
| **Observation** | Vital signs | At least BP (systolic/diastolic). Also: heart rate, temperature, respiratory rate, SpO2, weight, height |
| **Condition** | Diagnosis | `code` (ICD-10), `note` (chief complaint) |
| **Consent** | Privacy consent | Must be included if `consent_signed: true` |

### Minimal FHIR R4 Bundle Example

```json
{
  "resourceType": "Bundle",
  "type": "transaction",
  "timestamp": "2026-09-07T12:00:00.000Z",
  "entry": [
    {
      "fullUrl": "urn:uuid:patient-001",
      "resource": {
        "resourceType": "Patient",
        "meta": {
          "profile": ["http://fhir.ph/StructureDefinition/ph-core-patient"]
        },
        "identifier": [
          {
            "use": "official",
            "type": {
              "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/v2-0203", "code": "SB" }]
            },
            "system": "https://www.philhealth.gov.ph/memberid",
            "value": "0506-0708-0910"
          }
        ],
        "name": [
          {
            "use": "official",
            "family": "Reyes",
            "given": ["Ana", "Cruz"]
          }
        ],
        "gender": "female",
        "birthDate": "1988-11-20",
        "telecom": [
          { "system": "phone", "value": "0918-765-4321", "use": "mobile" }
        ],
        "address": [
          {
            "use": "home",
            "line": ["456 Bonifacio Avenue"],
            "city": "Quezon City",
            "district": "Metro Manila",
            "postalCode": "1100",
            "country": "PH"
          }
        ]
      },
      "request": { "method": "POST", "url": "Patient" }
    },
    {
      "fullUrl": "urn:uuid:encounter-001",
      "resource": {
        "resourceType": "Encounter",
        "status": "in-progress",
        "class": {
          "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
          "code": "AMB"
        },
        "priority": {
          "coding": [
            { "system": "http://terminology.hl7.org/CodeSystem/v3-ActPriority", "code": "R" }
          ]
        },
        "subject": { "reference": "urn:uuid:patient-001" },
        "reasonCode": [{ "text": "Follow-up consultation for hypertension" }],
        "serviceProvider": { "display": "WAH General Clinic" },
        "participant": [
          { "individual": { "display": "Dr. Ana Reyes" } }
        ]
      },
      "request": { "method": "POST", "url": "Encounter" }
    },
    {
      "fullUrl": "urn:uuid:obs-bp-001",
      "resource": {
        "resourceType": "Observation",
        "status": "final",
        "category": [
          {
            "coding": [
              { "system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "vital-signs" }
            ]
          }
        ],
        "code": {
          "coding": [{ "system": "http://loinc.org", "code": "85354-9", "display": "Blood pressure panel" }],
          "text": "Blood Pressure"
        },
        "subject": { "reference": "urn:uuid:patient-001" },
        "encounter": { "reference": "urn:uuid:encounter-001" },
        "component": [
          {
            "code": { "coding": [{ "system": "http://loinc.org", "code": "8480-6", "display": "Systolic blood pressure" }] },
            "valueQuantity": { "value": 135, "unit": "mmHg", "system": "http://unitsofmeasure.org", "code": "mm[Hg]" }
          },
          {
            "code": { "coding": [{ "system": "http://loinc.org", "code": "8462-4", "display": "Diastolic blood pressure" }] },
            "valueQuantity": { "value": 85, "unit": "mmHg", "system": "http://unitsofmeasure.org", "code": "mm[Hg]" }
          }
        ]
      },
      "request": { "method": "POST", "url": "Observation" }
    },
    {
      "fullUrl": "urn:uuid:condition-001",
      "resource": {
        "resourceType": "Condition",
        "clinicalStatus": {
          "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/condition-clinical", "code": "active" }]
        },
        "verificationStatus": {
          "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/condition-ver-status", "code": "provisional" }]
        },
        "code": {
          "coding": [{ "system": "http://hl7.org/fhir/sid/icd-10", "code": "I10", "display": "Essential (primary) hypertension" }],
          "text": "Essential (primary) hypertension"
        },
        "subject": { "reference": "urn:uuid:patient-001" },
        "encounter": { "reference": "urn:uuid:encounter-001" },
        "note": [{ "text": "Elevated blood pressure during routine check-up" }]
      },
      "request": { "method": "POST", "url": "Condition" }
    },
    {
      "fullUrl": "urn:uuid:consent-001",
      "resource": {
        "resourceType": "Consent",
        "status": "active",
        "scope": {
          "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/consentscope", "code": "patient-privacy" }]
        },
        "category": [
          { "coding": [{ "system": "http://loinc.org", "code": "59284-0", "display": "Patient Consent" }] }
        ],
        "patient": { "reference": "urn:uuid:patient-001" },
        "dateTime": "2026-09-07T12:00:00.000Z",
        "policy": [
          { "authority": "https://www.privacy.gov.ph", "uri": "https://www.privacy.gov.ph/data-privacy-act/" }
        ],
        "provision": { "type": "permit" }
      },
      "request": { "method": "POST", "url": "Consent" }
    }
  ]
}
```

### Additional Vital Sign Observations

You can add more Observation resources for each vital sign. Use these LOINC codes:

| Vital Sign | LOINC Code | Unit |
|---|---|---|
| Systolic BP | `8480-6` | mmHg |
| Diastolic BP | `8462-4` | mmHg |
| Heart Rate | `8867-4` | /min |
| Body Temperature | `8310-5` | Cel |
| Respiratory Rate | `9279-1` | /min |
| Oxygen Saturation | `2708-6` | % |
| Body Weight | `29463-7` | kg |
| Body Height | `8302-2` | cm |

---

## Webhook Setup (Receiving Data)

To receive data **from** iHOMIS (via iPaaS), you need a `POST /api/webhook` endpoint on your server.

### What the iPaaS sends to your webhook

When iHOMIS sends data to WAH through the iPaaS, your webhook will receive:

```json
{
  "transaction_id": "uuid-of-the-transaction",
  "source_system": "iHOMIS",
  "payload": {
    "resourceType": "Bundle",
    "type": "transaction",
    "entry": [
      /* FHIR R4 Patient, Encounter, Observation, Condition resources */
    ]
  },
  "raw_source_payload": {
    "format": "HL7V2",
    "message": "MSH|^~\\&|IHOMIS|..."
  },
  "request_id": "optional-request-id"
}
```

The `payload` will be a **FHIR R4 Bundle** (the iPaaS already transformed the HL7v2 into FHIR for you). The `raw_source_payload` contains the original untransformed data for audit purposes.

### Minimal Webhook Implementation (Next.js example)

```typescript
// app/api/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transaction_id, source_system, payload, raw_source_payload } = body;

    console.log(`Received data from ${source_system}, tx: ${transaction_id}`);

    // payload is a FHIR R4 Bundle — extract what you need
    const entries = payload?.entry || [];
    for (const entry of entries) {
      const resource = entry.resource;
      if (resource?.resourceType === 'Patient') {
        console.log('Patient:', resource.name);
      }
      if (resource?.resourceType === 'Condition') {
        console.log('Diagnosis:', resource.code);
      }
      // ... handle other resources
    }

    // Save to your database here
    // await db.insert({ ... });

    return NextResponse.json({ success: true, message: 'Data received' });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
```

### Your webhook MUST return

```json
{ "success": true }
```

with HTTP status `200`. If your webhook fails, the iPaaS will still mark the transaction as `SUCCESS` but log a forwarding warning.

---

## Complete Integration Examples

### Example 1: Send a patient record (WAH → iHOMIS)

```javascript
// In your WAH app frontend or backend
const response = await fetch('http://localhost:3000/api/ingest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    source_system: 'WAH',
    destination_system: 'iHOMIS',
    source_format: 'FHIR_R4',
    destination_format: 'HL7V2',
    payload: fhirBundle,           // Your FHIR R4 Bundle object
    original_json: fhirBundle,     // Same thing, for audit
    consent_signed: true,          // REQUIRED — must be true
  }),
});

const result = await response.json();
console.log(result);
// { success: true, transaction_id: "...", status: "SUCCESS", forwarded: true }
```

### Example 2: Send with external webhook URL

If your app is hosted somewhere other than `localhost:3002`, pass your webhook URL:

```javascript
const response = await fetch('http://localhost:3000/api/ingest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    source_system: 'WAH',
    destination_system: 'iHOMIS',
    source_format: 'FHIR_R4',
    destination_format: 'HL7V2',
    payload: fhirBundle,
    consent_signed: true,
    webhook_url: 'https://your-deployed-app.vercel.app/api/webhook',
  }),
});
```

### Example 3: cURL test

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "source_system": "WAH",
    "destination_system": "iHOMIS",
    "source_format": "FHIR_R4",
    "destination_format": "HL7V2",
    "consent_signed": true,
    "payload": {
      "resourceType": "Bundle",
      "type": "transaction",
      "entry": [
        {
          "fullUrl": "urn:uuid:patient-test",
          "resource": {
            "resourceType": "Patient",
            "identifier": [{"system": "https://www.philhealth.gov.ph/memberid", "value": "0102-0304-0506"}],
            "name": [{"family": "Test", "given": ["Juan", "Santos"]}],
            "gender": "male",
            "birthDate": "1990-05-15",
            "telecom": [{"system": "phone", "value": "0917-123-4567"}],
            "address": [{"line": ["123 Test St"], "city": "Manila", "district": "NCR", "postalCode": "1000", "country": "PH"}]
          },
          "request": {"method": "POST", "url": "Patient"}
        },
        {
          "fullUrl": "urn:uuid:encounter-test",
          "resource": {
            "resourceType": "Encounter",
            "status": "in-progress",
            "class": {"code": "AMB"},
            "priority": {"coding": [{"code": "R"}]},
            "subject": {"reference": "urn:uuid:patient-test"},
            "serviceProvider": {"display": "WAH Hospital"},
            "participant": [{"individual": {"display": "Dr. Test"}}],
            "reasonCode": [{"text": "Routine checkup"}]
          },
          "request": {"method": "POST", "url": "Encounter"}
        },
        {
          "fullUrl": "urn:uuid:condition-test",
          "resource": {
            "resourceType": "Condition",
            "code": {"coding": [{"system": "http://hl7.org/fhir/sid/icd-10", "code": "I10", "display": "Hypertension"}]},
            "subject": {"reference": "urn:uuid:patient-test"},
            "note": [{"text": "High blood pressure"}]
          },
          "request": {"method": "POST", "url": "Condition"}
        }
      ]
    }
  }'
```

---

## Consent & Data Privacy

⚠️ **IMPORTANT**: All records **must** have `consent_signed: true` in the request body.

Without consent, the iPaaS will:
- Return HTTP `422`
- Set the transaction status to `QUARANTINED`
- Include an error message referencing **Republic Act 10173 (Data Privacy Act of 2012)**

In your UI, make sure patients sign or agree to a consent form before sending their data.

---

## Error Handling

| Status | Response | Action |
|---|---|---|
| `200` with `success: true` | Record transformed and forwarded | ✅ Done |
| `200` with `forwarded: false` | Transformed but webhook delivery failed | Record is saved in iPaaS, check webhook URL |
| `400` | Missing required fields | Check your request body |
| `422` with `QUARANTINED` | Consent missing, transform failed, or validation error | Read the `message` field for details |
| `500` | Server error | Contact iPaaS team |

### Transaction Statuses

| Status | Meaning |
|---|---|
| `PENDING` | Received, waiting to transform |
| `TRANSFORMING` | AI transformation in progress |
| `SUCCESS` | Transformed and forwarded |
| `QUARANTINED` | Failed — check `error_message` |

---

## Testing Checklist

Before the end-of-month test, verify:

- [ ] **Send a record**: POST a FHIR R4 Bundle to `/api/ingest` → check it appears in the iPaaS Dashboard and in iHOMIS
- [ ] **Consent enforcement**: Send with `consent_signed: false` → confirm it gets QUARANTINED
- [ ] **Receive a record**: Have iHOMIS send data → confirm your `/api/webhook` receives a FHIR R4 Bundle
- [ ] **Check the Mapper page**: Open `http://localhost:3000/mapper` and verify both sides show correct field counts (WAH: 26 fields, iHOMIS: 27 fields)
- [ ] **Check transactions**: GET `/api/transactions` and verify your records appear
- [ ] **Missing fields**: Verify that fields not available in the source show as empty (not missing) in the comparison table

---

## Contact

If you run into issues during integration, check:
1. The iPaaS terminal logs for `[iPaaS Ingest]` messages
2. The `/api/transactions` endpoint for quarantined records
3. Your webhook endpoint logs for incoming data

Happy integrating! 🏥
