<div align="center">
  <h1>🏥 ADAPT LHIE — Local Health Information Exchange</h1>
  <p>
    <strong>AI-Powered Bi-Directional Interoperability Platform for Philippine Hospitals</strong>
  </p>
  <p>
    <em>Bridging legacy iHOMIS (HL7 v2) and modern WAH (FHIR R4) systems through an intelligent integration middleware</em>
  </p>

  <p>
    <a href="#about">About</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#features">Features</a> •
    <a href="#tech-stack">Tech Stack</a> •
    <a href="#getting-started">Getting Started</a> •
    <a href="#data-formats">Data Formats</a> •
    <a href="#references">References</a>
  </p>

  <p>
    <img src="https://img.shields.io/badge/-Next.js_16-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js">
    <img src="https://img.shields.io/badge/-TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/-Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase">
    <img src="https://img.shields.io/badge/-Gemini_AI-8E75B2?style=for-the-badge&logo=google&logoColor=white" alt="Gemini AI">
    <img src="https://img.shields.io/badge/-HL7_FHIR_R4-DC382D?style=for-the-badge&logo=data:image/svg+xml;base64,&logoColor=white" alt="FHIR R4">
    <img src="https://img.shields.io/badge/-Turborepo-EF4444?style=for-the-badge&logo=turborepo&logoColor=white" alt="Turborepo">
  </p>
</div>

<br />

## 📖 About <a name="about"></a>

**ADAPT LHIE** (Advanced Data Architecture for Philippine Transformation — Local Health Information Exchange) is a prototype interoperability platform that solves a critical problem in Philippine public healthcare: **the inability of legacy hospital systems to communicate with modern clinical systems**.

The Philippines Department of Health (DOH) mandates the use of **iHOMIS** (Integrated Hospital Operations & Management Information System) — a system built on the legacy **HL7 v2** pipe-delimited format from the 1990s. Meanwhile, modern hospital systems like **WAH** (Wireless Access for Health) operate on the international **HL7 FHIR R4** standard.

This platform provides an **AI-powered integration middleware (iPaaS)** that:
- Transforms HL7 v2 messages into FHIR R4 Bundles (and vice versa) using **Google Gemini AI**
- Validates transformed payloads against **PH Core FHIR profiles**
- Provides **real-time data comparison visualizers** for clinical auditability
- Supports full **CRUD lifecycle management** for patient records on both systems

> **Note:** This is a capstone/thesis prototype demonstrating interoperability concepts. It is not intended for production clinical use without proper security hardening and compliance certification.

---

## 🏗️ Architecture <a name="architecture"></a>

The system follows a **3-node hub-and-spoke architecture** with the iPaaS acting as the central transformation and routing engine.

```
┌─────────────────┐          ┌─────────────────────┐          ┌─────────────────┐
│                 │          │                     │          │                 │
│   iHOMIS (DOH)  │──HL7v2──▶│    ADAPT iPaaS      │──FHIR──▶│  WAH Hospital   │
│   Port :3001    │          │    Port :3000        │          │   Port :3002    │
│                 │◀─iHOMIS──│                     │◀─FHIR───│                 │
│   Supabase #1   │  JSON    │  Gemini AI Engine   │  R4     │   Supabase #2   │
│                 │          │  + FHIR Validator    │          │                 │
└─────────────────┘          │  + Transaction Logs  │          └─────────────────┘
                             │                     │
                             │   Supabase #3       │
                             └─────────────────────┘
```

### Data Flow

**iHOMIS → WAH (HL7 v2 → FHIR R4):**
1. Clinician saves patient record in iHOMIS (flat JSON with vitals, demographics, diagnosis)
2. iHOMIS converts the record to a pipe-delimited **HL7 v2 message** (MSH, PID, PV1, OBX, DG1, RF1 segments)
3. HL7 v2 message + original JSON are sent to **iPaaS `/api/ingest`**
4. iPaaS uses **Gemini AI** to transform HL7 v2 → **FHIR R4 Transaction Bundle** (Patient, Encounter, Observation, Condition resources)
5. iPaaS validates the bundle, logs the transaction, and forwards to **WAH webhook**
6. WAH stores both the transformed FHIR bundle and the original source for comparison

**WAH → iHOMIS (FHIR R4 → iHOMIS JSON):**
1. Clinician saves a FHIR R4 Bundle in WAH
2. WAH sends the bundle + original JSON to **iPaaS `/api/ingest`**
3. iPaaS uses **Gemini AI** to flatten the FHIR Bundle into **iHOMIS-compatible JSON** (demographics, vitals, diagnosis fields)
4. iPaaS validates, logs, and forwards to **iHOMIS webhook**
5. iHOMIS stores the transformed record with the original FHIR source for comparison

---

## ✨ Features <a name="features"></a>

### 🔄 Bi-Directional Data Transformation
- **HL7 v2 → FHIR R4**: Converts pipe-delimited legacy messages into structured FHIR Transaction Bundles
- **FHIR R4 → iHOMIS JSON**: Flattens rich FHIR resources back into iHOMIS-compatible flat records
- **AI-Powered**: Uses Google Gemini for intelligent semantic mapping (not rigid field-by-field rules)
- **Model Fallback Chain**: Automatically cycles through 5+ Gemini models if one hits rate limits (429/503)

### 📊 Data Comparison Visualizer
Each inbox provides a **4-mode visualizer** for auditing transformation accuracy:

| Mode | Description |
|------|-------------|
| **Field Summary** | Table showing all fields with ● Present / ● Missing indicators + counts |
| **Transformed JSON** | The AI-transformed output (FHIR R4 or iHOMIS JSON) |
| **Original Source** | The clean source data as it was stored before transformation |
| **Compare** | Side-by-side: Original (left) vs Transformed (right) |

### 📋 Full CRUD Record Management
- **Create**: Auto-fill with realistic Filipino patient sample data for rapid testing
- **Read**: Records dashboard with search, status badges, and JSON viewers
- **Update**: Edit records inline before sending
- **Delete**: All delete actions require explicit confirmation via modal dialog

### 📥 Inbox Workflow
- **Receive**: Incoming records appear in the Inbox with source labels
- **Review**: Expand to view field summary, compare transformations
- **Accept**: Move to Records for further editing or forwarding
- **Delete**: Remove unwanted records with confirmation

### 🔒 iPaaS Transaction Management
- **Transaction Logging**: Every transformation is logged with UUID, timestamps, status
- **Validation Engine**: FHIR bundles are validated for required resource types and structure
- **Metrics Dashboard**: Track total transactions, success rates, and throughput
- **Quarantine**: Failed transformations are quarantined for manual review

---

## 🛠️ Tech Stack <a name="tech-stack"></a>

The system is built as a **Turborepo monorepo** with three independent Next.js applications sharing a common package.

| Component | Technology | Description |
|-----------|------------|-------------|
| **Monorepo** | ![Turborepo](https://img.shields.io/badge/-Turborepo-EF4444?logo=turborepo&logoColor=white) | Workspace orchestration for parallel development and builds |
| **Framework** | ![Next.js](https://img.shields.io/badge/-Next.js_16-000000?logo=next.js&logoColor=white) | React framework with App Router, API Routes, and Turbopack |
| **Language** | ![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white) | Type-safe development across all services |
| **Database** | ![Supabase](https://img.shields.io/badge/-Supabase-3ECF8E?logo=supabase&logoColor=white) ![PostgreSQL](https://img.shields.io/badge/-PostgreSQL-4169E1?logo=postgresql&logoColor=white) | 3 isolated Supabase projects (one per system) with JSONB payload storage |
| **AI Engine** | ![Google](https://img.shields.io/badge/-Gemini_AI-8E75B2?logo=google&logoColor=white) | Data transformation via `@google/generative-ai` SDK with structured JSON output |
| **Styling** | ![CSS3](https://img.shields.io/badge/-CSS3-1572B6?logo=css3&logoColor=white) | Custom design system per app (light mode, hospital-standard typography) |
| **Shared** | ![npm](https://img.shields.io/badge/-Internal_Package-CB3837?logo=npm&logoColor=white) | `@adapt/shared` — TypeScript types, constants, and FHIR system URIs |

### Monorepo Structure

```
adapt-lhie-prototype/
├── apps/
│   ├── adapt-ipaas/          # iPaaS — Transformation & routing engine (:3000)
│   │   ├── src/app/api/
│   │   │   ├── ingest/       # POST — Receive, transform, forward
│   │   │   ├── transactions/ # GET  — Transaction log viewer
│   │   │   └── metrics/      # GET  — Dashboard metrics
│   │   └── src/lib/
│   │       ├── gemini.ts     # AI transformation with model fallback
│   │       ├── validator.ts  # FHIR R4 bundle validator
│   │       └── supabase.ts   # Database client with env guard
│   │
│   ├── ihomis/               # iHOMIS — DOH legacy system simulator (:3001)
│   │   ├── src/app/
│   │   │   ├── save/         # Create patient records (auto-fill)
│   │   │   ├── records/      # View, send, delete records
│   │   │   └── inbox/        # Receive FHIR→iHOMIS conversions
│   │   └── src/app/api/
│   │       ├── patients/     # CRUD API (GET/POST/PUT/DELETE)
│   │       ├── send/         # HL7 v2 builder + iPaaS dispatch
│   │       └── webhook/      # Receive transformed data from iPaaS
│   │
│   └── wah-hospital/         # WAH — Modern FHIR R4 system (:3002)
│       ├── src/app/
│       │   ├── save/         # Create FHIR bundles (auto-fill)
│       │   ├── records/      # View, send, delete records
│       │   └── inbox/        # Receive HL7v2→FHIR conversions
│       └── src/app/api/
│           ├── patients/     # CRUD API (GET/POST/PUT/DELETE)
│           ├── send/         # FHIR bundle dispatch to iPaaS
│           └── webhook/      # Receive transformed data from iPaaS
│
├── database/
│   ├── supabase_schema.sql   # iPaaS: adapt_transaction_logs
│   ├── ihomis_schema.sql     # iHOMIS: ihomis_patients
│   └── wah_schema.sql        # WAH: wah_patients
│
├── packages/
│   └── shared/               # @adapt/shared — Types, constants, FHIR URIs
│       └── src/
│           ├── types/        # TypeScript interfaces (FHIR, iHOMIS, iPaaS)
│           └── constants.ts  # System names, status codes, endpoints
│
├── turbo.json                # Turborepo pipeline config
├── package.json              # Root workspace config
└── .env.example              # Environment variable template
```

---

## 🚀 Getting Started <a name="getting-started"></a>

### Prerequisites
- **Node.js** 18+ (LTS recommended)
- **npm** 9+
- **3 Supabase projects** (free tier works) — one for each system
- **Google Gemini API key** — [Get one at aistudio.google.com](https://aistudio.google.com/apikey)

### 1. Clone the Repository

```bash
git clone https://github.com/Vince0028/WAH4PC4-MERGE-CONFLICT.git
cd WAH4PC4-MERGE-CONFLICT
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Databases

Run each SQL schema in its respective Supabase project's SQL Editor:

| File | Supabase Project | Table Created |
|------|-----------------|---------------|
| `database/supabase_schema.sql` | iPaaS project | `adapt_transaction_logs` |
| `database/ihomis_schema.sql` | iHOMIS project | `ihomis_patients` |
| `database/wah_schema.sql` | WAH project | `wah_patients` |

> **Important:** All schemas use `DROP TABLE IF EXISTS ... CASCADE` so they are safe to re-run.

### 4. Configure Environment Variables

Create `.env.local` in each app directory:

**`apps/adapt-ipaas/.env.local`**
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-ipaas-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-ipaas-anon-key
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.1-flash-lite
IHOMIS_WEBHOOK_URL=http://localhost:3001/api/webhook
WAH_WEBHOOK_URL=http://localhost:3002/api/webhook
```

**`apps/ihomis/.env.local`**
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-ihomis-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-ihomis-anon-key
NEXT_PUBLIC_IPAAS_API_URL=http://localhost:3000/api
```

**`apps/wah-hospital/.env.local`**
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-wah-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-wah-anon-key
NEXT_PUBLIC_IPAAS_API_URL=http://localhost:3000/api
```

### 5. Run All Services

```bash
# All three at once via Turborepo
npm run dev

# Or individually
npm run dev:ipaas    # Port 3000
npm run dev:ihomis   # Port 3001
npm run dev:wah      # Port 3002
```

### 6. Test the Flow

1. Open **iHOMIS** at `http://localhost:3001/save`
2. Click **Auto-fill** → **Save Record**
3. Go to **Records** → Click **Send to WAH**
4. Open **WAH** at `http://localhost:3002/inbox`
5. View the received record → Click **View data comparison**
6. Use the **Field Summary** / **Compare** tabs to verify the transformation

---

## 📋 Data Formats <a name="data-formats"></a>

### HL7 v2 (iHOMIS)

The legacy format used by DOH systems. Messages are pipe-delimited (`|`) with caret (`^`) sub-field separators:

```
MSH|^~\&|iHOMIS|DOH-001|ADAPT_IPAAS|ADAPT|20260515||ADT^A01|MSG123|P|2.5
PID|1||0102-0304-0506^^^PhilHealth^SB||Dela Cruz^Juan^Santos^^^||19900515|M|||123 Rizal St^^Makati^Metro Manila^^PH
PV1|1|O|DOH-001||||||Dr. Maria Santos^PRC-12345||||||||||||||||||||||ROUTINE
OBX|1|NM|8480-6^Systolic Blood Pressure^LN||120|mmHg|||||F
OBX|2|NM|8462-4^Diastolic Blood Pressure^LN||80|mmHg|||||F
DG1|1||J18.9^Pneumonia, unspecified organism^I10|||admitting
RF1|ROUTINE|Specialist consult||DOH General Hospital
```

**Segment Reference:**
| Segment | Purpose | Key Fields |
|---------|---------|------------|
| `MSH` | Message Header | Sending facility, timestamp, message type |
| `PID` | Patient Identification | Name, DOB, sex, address, PhilHealth ID |
| `PV1` | Patient Visit | Physician, facility, visit class, priority |
| `OBX` | Observation (Vitals) | LOINC code, value, unit of measure |
| `DG1` | Diagnosis | ICD-10 code, description, type |
| `RF1` | Referral | Priority, reason, destination facility |

### FHIR R4 (WAH)

The modern international standard. Data is structured as a **Transaction Bundle** containing typed resources:

```json
{
  "resourceType": "Bundle",
  "type": "transaction",
  "entry": [
    {
      "resource": {
        "resourceType": "Patient",
        "meta": { "profile": ["http://fhir.ph/StructureDefinition/ph-core-patient"] },
        "identifier": [{ "system": "https://www.philhealth.gov.ph/memberid", "value": "0102-0304-0506" }],
        "name": [{ "family": "Dela Cruz", "given": ["Juan", "Santos"] }],
        "gender": "male",
        "birthDate": "1990-05-15"
      }
    },
    {
      "resource": {
        "resourceType": "Observation",
        "code": { "coding": [{ "system": "http://loinc.org", "code": "8480-6", "display": "Systolic Blood Pressure" }] },
        "valueQuantity": { "value": 120, "unit": "mmHg" }
      }
    }
  ]
}
```

### AI Transformation (Gemini)

The iPaaS uses **Google Gemini** with structured JSON output (`responseMimeType: 'application/json'`) and low temperature (`0.1`) for deterministic results. The AI is prompted with:

- **Field mapping instructions** (e.g., `PID.5 → Patient.name.family`)
- **Code system URIs** (LOINC, ICD-10, PhilHealth)
- **PH Core profile requirements** (meta profiles, identifier systems)
- **Output schema constraints** (exact JSON structure expected)

**Model Fallback Chain:** If the primary model hits rate limits (429) or is unavailable (503), the system automatically cycles through:
1. `gemini-3.1-flash-lite` (500 RPD — primary)
2. `gemini-2.5-flash-lite` (20 RPD)
3. `gemini-2.5-flash` (20 RPD)
4. `gemini-3-flash` (20 RPD)
5. `gemini-2.0-flash` (fallback)

---

## 🗄️ Database Schema <a name="database-schema"></a>

Each system uses a **Metadata + JSONB Payload** pattern for flexible data storage:

### iHOMIS — `ihomis_patients`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `patient_name` | TEXT | Denormalized display name |
| `philhealth_no` | TEXT | PhilHealth member ID |
| `hl7v2_payload` | JSONB | Full patient data (demographics, vitals, diagnosis) |
| `raw_source_payload` | JSONB | Original source data from sender (for comparison) |
| `status` | TEXT | `SAVED` / `SENT` / `RECEIVED` |
| `source` | TEXT | `LOCAL` / `RECEIVED` |

### WAH — `wah_patients`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `patient_name` | TEXT | Denormalized display name |
| `fhir_bundle` | JSONB | Full FHIR R4 Transaction Bundle |
| `raw_source_payload` | JSONB | Original source data from sender (for comparison) |
| `status` | TEXT | `SAVED` / `SENT` / `RECEIVED` |
| `source` | TEXT | `LOCAL` / `RECEIVED` |

### iPaaS — `adapt_transaction_logs`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Transaction ID |
| `source_system` | TEXT | `iHOMIS` or `WAH` |
| `destination_system` | TEXT | `WAH` or `iHOMIS` |
| `raw_payload` | JSONB | Original incoming data |
| `transformed_payload` | JSONB | AI-transformed output |
| `status` | TEXT | `PENDING` / `TRANSFORMING` / `SUCCESS` / `QUARANTINED` |
| `validation_errors` | JSONB | Any FHIR validation issues |

---

## 📚 References & Standards <a name="references"></a>

### Healthcare Standards
| Standard | Version | Usage | Documentation |
|----------|---------|-------|---------------|
| **HL7 v2** | 2.5 | Legacy message format (iHOMIS) | [hl7.org/implement/standards/product_brief.cfm?product_id=185](https://www.hl7.org/implement/standards/product_brief.cfm?product_id=185) |
| **HL7 FHIR** | R4 (4.0.1) | Modern interop standard (WAH) | [hl7.org/fhir/R4](https://hl7.org/fhir/R4/) |
| **PH Core IG** | Draft | Philippine FHIR Implementation Guide | [fhir.ph](https://fhir.ph/) |
| **LOINC** | 2.77 | Observation/vital sign codes | [loinc.org](https://loinc.org/) |
| **ICD-10** | 2024 | Diagnosis classification codes | [icd.who.int/browse10](https://icd.who.int/browse10/2019/en) |
| **PhilHealth** | — | Philippine Health Insurance Corp IDs | [philhealth.gov.ph](https://www.philhealth.gov.ph/) |

### Technologies
| Technology | Documentation |
|------------|---------------|
| **Next.js 16** | [nextjs.org/docs](https://nextjs.org/docs) |
| **Turborepo** | [turbo.build/repo/docs](https://turbo.build/repo/docs) |
| **Supabase** | [supabase.com/docs](https://supabase.com/docs) |
| **Google Gemini API** | [ai.google.dev/docs](https://ai.google.dev/docs) |
| **@google/generative-ai** | [npmjs.com/package/@google/generative-ai](https://www.npmjs.com/package/@google/generative-ai) |

### Philippine Health IT Context
| Resource | Description |
|----------|-------------|
| **iHOMIS** | DOH's Integrated Hospital Operations & Management Information System — mandated for government hospitals |
| **UHC Act (RA 11223)** | Universal Health Care Act requiring health information exchange infrastructure |
| **DICT eHealth Standards** | Philippine standards for electronic health records and interoperability |

### Key FHIR System URIs Used
```typescript
PHILHEALTH:             "https://www.philhealth.gov.ph/memberid"
ICD10:                  "http://hl7.org/fhir/sid/icd-10"
LOINC:                  "http://loinc.org"
ENCOUNTER_CLASS:        "http://terminology.hl7.org/CodeSystem/v3-ActCode"
CONDITION_CLINICAL:     "http://terminology.hl7.org/CodeSystem/condition-clinical"
OBSERVATION_CATEGORY:   "http://terminology.hl7.org/CodeSystem/observation-category"
PH_CORE_PATIENT:        "http://fhir.ph/StructureDefinition/ph-core-patient"
```

---

## ❓ Defense Q&A — System Flow Diagrams <a name="defense-qa"></a>

The following flowcharts address key questions raised during system evaluation. Each diagram uses standard flowchart notation: **rectangles** = process steps, **diamonds** = decision points, **ovals** = start/end, **parallelograms** = input/output.

---

### Q1 — "Does automation remove humans? How do you prevent Garbage-In-Garbage-Out?"

> Automation replaces **format conversion** (HL7v2 ↔ FHIR), not clinical judgment. Two human checkpoints remain: data entry and inbox review. The FHIR Validator acts as a digital immune system — quarantining bad transformations before they reach the network.

```mermaid
flowchart TD
    A([START]) --> B[Clinician enters patient data\nin iHOMIS\n📋 Demographics · Vitals · ICD-10]
    B --> C[iHOMIS auto-encodes\nto HL7v2 Message\nMSH · PID · PV1 · OBX · DG1 · RF1]
    C --> D[POST to iPaaS /api/ingest\nHL7v2 + original JSON]
    D --> E[/Gemini AI transforms\nHL7v2 → FHIR R4 Bundle\ntemp=0.1 · structured JSON output/]
    E --> F{FHIR Validator\nPasses?}
    F -- NO --> G[🚫 QUARANTINE\nStatus = QUARANTINED\nAdmin alerted · Never forwarded]
    F -- YES --> H[(Log Transaction\nadapt_transaction_logs\nUUID · status=SUCCESS · both payloads)]
    H --> I[POST to WAH /api/webhook\nFHIR Bundle forwarded]
    I --> J[(WAH DB stores record\nstatus = RECEIVED\nsource = RECEIVED)]
    J --> K[WAH Clinician reviews Inbox\n🔍 Field Summary · Compare · Source]
    K --> L{Clinician\nAccepts?}
    L -- REJECT --> M[🚫 Record deleted\nLog updated]
    L -- ACCEPT --> N[✅ Record active in WAH\nCare continues]
    N --> O([END])

    style G fill:#2d1010,stroke:#f85149,color:#f85149
    style M fill:#2d1010,stroke:#f85149,color:#f85149
    style N fill:#0d2818,stroke:#3fb950,color:#3fb950
    style H fill:#0c1a2e,stroke:#79c0ff,color:#79c0ff
    style J fill:#0c1a2e,stroke:#79c0ff,color:#79c0ff
    style E fill:#130d1f,stroke:#bc8cff,color:#e6edf3
```

**Key Safeguards:**
| Safeguard | How It Works |
|-----------|-------------|
| **Structured AI Output** | `responseMimeType: 'application/json'` prevents hallucination — output must match schema |
| **FHIR Validator** | Checks for required resource types (Patient, Encounter, Observation) before forwarding |
| **Quarantine** | Failed records are blocked — never reach the destination network |
| **Source Preserved** | `raw_source_payload` always stored alongside transformed record for comparison |
| **Human Gate #1** | Clinician enters data — system cannot fabricate clinical decisions |
| **Human Gate #2** | WAH clinician must explicitly Accept before record enters their system |

---

### Q2 — "How will you manage patient consent? Implied consent is a legal nightmare."

> ADAPT targets **referral-based consent** — the patient consents once when agreeing to the referral, and that consent event (tracked via the RF1 segment + transaction UUID) covers the data transfer. No per-move waivers. No pure implied consent.

```mermaid
flowchart TD
    A([START\nPatient seeks care at DOH]) --> B[Patient registers in iHOMIS\nDemographics · PhilHealth ID]
    B --> C{Consent flag\nalready on file?}
    C -- NO --> D[Obtain broad consent\nOne-time · Covers network referrals\nper RA 10173 / UHC Act RA 11223]
    D --> E[(Consent flag stored in\npatient record\nconsent = TRUE)]
    C -- YES --> E
    E --> F[Clinician issues referral\nHL7v2 RF1 segment generated\nReferral = specific consent event]
    F --> G{Consent flag = TRUE\nAND destination\nfacility authorized?}
    G -- NO --> H[🚫 Transfer BLOCKED\nLog denial · Alert clinician]
    G -- YES --> I[/iPaaS transforms &\nforwards data\nRF1 segment = consent evidence/]
    I --> J[(Transaction logged\nadapt_transaction_logs\nconsent_ref = referral UUID)]
    J --> K[WAH Clinician reviews\nHuman confirmation #2]
    K --> L[✅ Transfer legally auditable\nConsent → Referral → Log chain]
    L --> M([END])

    style H fill:#2d1010,stroke:#f85149,color:#f85149
    style L fill:#0d2818,stroke:#3fb950,color:#3fb950
    style J fill:#0c1a2e,stroke:#79c0ff,color:#79c0ff
    style I fill:#130d1f,stroke:#bc8cff,color:#e6edf3
```

**Consent Model Comparison:**
| Model | Risk | ADAPT Stance |
|-------|------|-------------|
| Per-transfer waiver | Blocks emergency care | ❌ Not adopted |
| Implied consent | RA 10173 violation risk | ❌ Not adopted |
| **Referral-based consent** | Patient agrees to referral = data follows | ✅ Target model |
| Broad registration consent | One-time, covers network | ✅ Complementary layer |

---

### Q3 — "Where does data live? Centralized = single point of failure. Decentralized = uneven security."

> ADAPT uses a **federated hub-and-spoke** model. Patient data stays at the source hospital's own database. The iPaaS (hub) only holds transaction logs — it is a **router, not a vault**. A breach of the hub exposes metadata only.

```mermaid
flowchart TD
    A([WHERE DOES THE DATA LIVE?]) --> B{Architecture\nType?}
    B --> C[(iHOMIS DB\nDOH Supabase\nihomis_patients\nHL7v2 JSON)]
    B --> D[(iPaaS DB\nADAPT Supabase\nadapt_transaction_logs\nNO PHI stored permanently)]
    B --> E[(WAH DB\nWAH Supabase\nwah_patients\nFHIR R4 Bundle)]

    C & D & E --> F[Each DB = separate project\nSeparate credentials · Separate RLS policies\nSeparate API keys]

    F --> G{Scenario:\niPaaS hub\ncompromised?}
    G -- Impact? --> H[✅ DOH & WAH DBs unaffected\nSeparate keys\nNo cross-access]
    G -- What leaks? --> I[⚠️ Transaction logs only\nNo PHI in logs\nMetadata exposed at worst]

    F --> J{Scenario:\nHospital DB\ncompromised?}
    J -- Impact? --> K[✅ Other hospital DB unaffected\nIsolated Supabase instances]
    J -- Hub impact? --> L[⚠️ iPaaS logs show\nonly metadata\nNo PHI in hub]

    F --> M[Production hardening required\nbefore clinical use]
    M --> N{Hardening\napplied?}
    N -- NO --> O[🚫 Prototype only\nDo not use real PHI]
    N -- YES --> P[RLS row-level security\nTLS in transit\nWebhook HMAC auth\nJWT bearer tokens]
    P --> Q[✅ Clinical use ready\nper DICT eHealth Standards]
    Q --> R([END])

    style O fill:#2d1010,stroke:#f85149,color:#f85149
    style Q fill:#0d2818,stroke:#3fb950,color:#3fb950
    style C fill:#0c1a2e,stroke:#79c0ff,color:#79c0ff
    style D fill:#0c1a2e,stroke:#79c0ff,color:#79c0ff
    style E fill:#0c1a2e,stroke:#79c0ff,color:#79c0ff
```

**Architecture Tradeoffs:**
| Risk | Fully Centralized | Fully Decentralized | ADAPT Federated |
|------|:-----------------:|:-------------------:|:---------------:|
| Single point of failure | 🔴 High | 🟢 Low | 🟡 Medium — hub holds no PHI |
| Security consistency | 🟢 Easy | 🔴 Hard | 🟡 3 isolated systems |
| Data ownership | 🔴 Unclear | 🟢 Clear | 🟢 Each hospital owns its DB |
| Availability | 🔴 Low | 🟢 High | 🟡 iPaaS outage pauses transfers only |

---

### Q4 — "What if a patient from DOH switched to WAH? How will the data flow?"

> The DOH clinician clicks **"Send to WAH"** — this triggers the entire pipeline. The patient's PhilHealth number serves as the cross-system unique identifier. Their complete clinical record (demographics, vitals, diagnosis, visit info) is automatically converted from HL7v2 to FHIR R4 and delivered to WAH's Inbox for clinical review.

```mermaid
flowchart TD
    A([START\nPatient leaves DOH → transfers to WAH]) --> B[(iHOMIS — Existing Patient Record\nMaria Santos · PhilHealth 0102-0304-0506\nVitals · Diagnosis · Visit history)]
    B --> C[DOH Clinician clicks\n'Send to WAH'\nHuman-initiated trigger]
    C --> D[/Build HL7v2 Message\nMSH · PID · PV1 · OBX · DG1 · RF1/]
    D --> E[POST → iPaaS /api/ingest\nHL7v2 payload + original JSON]
    E --> F[/Gemini AI transforms\nPID → Patient resource · PhilHealth ID preserved\nOBX → Observation · LOINC codes\nDG1 → Condition · ICD-10\nPV1 → Encounter/]
    F --> G{FHIR Bundle\nValid?}
    G -- INVALID --> H[🚫 QUARANTINE\nAdmin notified\nNot forwarded to WAH]
    G -- VALID --> I[(Log: source=iHOMIS\ndest=WAH · status=SUCCESS\nUUID timestamp)]
    I --> J[POST → WAH /api/webhook\nFHIR R4 Bundle + original source]
    J --> K[(WAH DB — wah_patients\nstatus = RECEIVED\nsource = RECEIVED)]
    K --> L[WAH Inbox — Clinician reviews\nField Summary · Side-by-side Compare\nOriginal Source view]
    L --> M{WAH Clinician\nAccepts?}
    M -- REJECT --> N[Record removed from Inbox\nLog noted]
    M -- ACCEPT --> O[✅ Maria is now a WAH patient\nFull history in FHIR R4\nNo re-entry needed]
    O --> P[WAH updates record later\nSends back to DOH]
    P --> Q[/Reverse flow:\nFHIR R4 → Gemini AI → iHOMIS JSON\nPOST → iHOMIS /api/webhook/]
    Q --> R[(DOH Inbox receives update\nBidirectional sync complete)]
    R --> S([END — Bidirectional care record])

    style H fill:#2d1010,stroke:#f85149,color:#f85149
    style N fill:#2d1010,stroke:#f85149,color:#f85149
    style O fill:#0d2818,stroke:#3fb950,color:#3fb950
    style B fill:#0c1a2e,stroke:#79c0ff,color:#79c0ff
    style I fill:#0c1a2e,stroke:#79c0ff,color:#79c0ff
    style K fill:#0c1a2e,stroke:#79c0ff,color:#79c0ff
    style R fill:#0c1a2e,stroke:#79c0ff,color:#79c0ff
    style F fill:#130d1f,stroke:#bc8cff,color:#e6edf3
    style Q fill:#130d1f,stroke:#bc8cff,color:#e6edf3
```

**What Data Successfully Transfers:**
| Data Type | HL7v2 Source | FHIR R4 Target | Status |
|-----------|-------------|----------------|--------|
| Patient Identity | `PID` — Name, DOB, PhilHealth ID | `Patient` resource + PhilHealth identifier | ✅ Full |
| Vitals | `OBX` — BP, HR, Temp (LOINC coded) | `Observation` resources with LOINC + units | ✅ Full |
| Diagnosis | `DG1` — ICD-10 code + description | `Condition` resource with ICD-10 system | ✅ Full |
| Visit Info | `PV1` — Physician, facility, visit class | `Encounter` resource with practitioner ref | ✅ Full |
| Referral Reason | `RF1` — Priority, reason, destination | `ServiceRequest` / Encounter note | ⚡ Partial |
| Extended History | Not in current segments | Requires AllergyIntolerance, MedicationRequest | 🔲 Future scope |

---

## ⚠️ Limitations & Disclaimers

- **Prototype Only**: This system is built for academic/capstone demonstration purposes
- **No Authentication**: RLS policies are set to `ALLOW ALL` — production use requires proper RBAC
- **AI Accuracy**: Gemini transformations are non-deterministic — clinical validation is mandatory
- **Free Tier**: Gemini API free tier has rate limits (RPM/RPD) — the fallback chain mitigates but doesn't eliminate this
- **No PHI**: Do not use real patient data — all sample data is synthetic

---

## 👥 Authors

- **Vince** — Developer & Systems Architect

---

<div align="center">
  <br />
  <p>
    <strong>ADAPT LHIE</strong> — Advancing Philippine Health Interoperability
  </p>
  <p>
    <sub>Built with Next.js, Supabase, and Gemini AI</sub>
  </p>
</div>
