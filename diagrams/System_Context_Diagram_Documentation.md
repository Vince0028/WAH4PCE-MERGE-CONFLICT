# WAH4PCE — System Context Diagram Documentation

## Project Information

| Field | Detail |
|-------|--------|
| **Project Title** | WAH4PCE: An AI-Driven Interoperability Bridge for iHOMIS |
| **Team Name** | Merge Conflict |
| **Academic Year** | AY 2025-2026 |
| **Authors** | Vince Nelmar P. Alobin, Qelvin Joseler Nagales, Marwin John Gonzales, Rick Francis T. Cruz |
| **Co-Author** | Jose Eugenio L. Quesada |

---

## 1. System Context Overview

The WAH4PCE System Context Diagram represents the **ADAPT LHIE (Local Health Information Exchange)** platform — an AI-powered interoperability bridge that enables bi-directional communication between legacy DOH hospital systems (iHOMIS) and modern WAH-partnered hospitals using the HL7 FHIR R4 standard.

The system follows a **3-Node Hub-and-Spoke (Federated) Architecture**:

| Node | System | Role | Port | Data Format |
|------|--------|------|------|-------------|
| Node 1 | **iHOMIS** | DOH Legacy Hospital System | :3001 | HL7 v2 (pipe-delimited) + flat JSON |
| Node 2 | **ADAPT iPaaS** | AI-Powered Middleware (Hub) | :3000 | Both (translates between them) |
| Node 3 | **WAH Hospital** | Modern FHIR R4 System | :3002 | FHIR R4 Transaction Bundle (JSON) |

---

## 2. External Actors

### 2.1 Human Actors

| Actor | Description | Interactions |
|-------|-------------|-------------|
| **Patient** | End beneficiary of the system. Provides one-time consent for data sharing when registering at a facility. | Registers with PhilHealth ID and signs consent form at either iHOMIS or WAH facilities. |
| **iHOMIS Healthcare Staff** (DOH Doctor) | Clinicians working in DOH/government hospitals using the iHOMIS system. | Creates/edits patient records, initiates referrals to WAH, reviews incoming records from WAH in the Inbox. |
| **WAH Healthcare Staff** (WAH Doctor) | Clinicians working in WAH-partnered hospitals using FHIR R4. | Creates/edits FHIR R4 patient records, initiates referrals to iHOMIS, reviews incoming records in the Inbox. |
| **WAH4PCE Admin** (System Administrator) | IT administrator overseeing the interoperability pipeline. | Monitors the iPaaS dashboard, reviews quarantined records, checks system metrics and transaction logs, manages system health. |

### 2.2 System Actors

| Actor | Description | Interactions |
|-------|-------------|-------------|
| **WAH4PCE AI Agent** (Gemini via MCP) | AI engine that automatically parses, maps, and translates health records. Operates via Model Context Protocol (MCP) using In-Context Learning (ICL). | Transforms HL7 v2 ↔ FHIR R4, validates consent flags, performs semantic terminology mapping (LOINC, ICD-10), applies PH Core profile compliance. |

---

## 3. Internal System Components

### 3.1 iHOMIS — DOH Legacy Hospital System (Port :3001)

**Technology:** Next.js 16 | TypeScript | Supabase (PostgreSQL + JSONB)

| Component | Path | Function |
|-----------|------|----------|
| Save Page | `/save` | Create new patient records with auto-fill for synthetic test data |
| Records Page | `/records` | View, edit, delete records; move to Send Queue |
| Send Queue Page | `/send` | Queue and dispatch records to WAH via iPaaS |
| Inbox Page | `/inbox` | Receive and review transformed records from WAH |
| Patient CRUD API | `/api/patients` | REST API (GET / POST / PUT / DELETE) |
| HL7 v2 Builder & Send API | `/api/send` | Constructs HL7 v2 messages (MSH\|PID\|PV1\|OBX\|DG1\|RF1), sends to iPaaS |
| Webhook Receiver | `/api/webhook` | Receives transformed data from iPaaS |
| Database | `ihomis_patients` | Supabase #1 — stores patient records in HL7 v2 JSON + JSONB format |

**Record Status Flow:** `SAVED → QUEUED → SENT` (or `REJECTED`)

### 3.2 ADAPT iPaaS — AI-Powered Middleware (Port :3000)

**Technology:** Next.js 16 | TypeScript | Supabase | Google Gemini AI SDK

| Component | Path/Module | Function |
|-----------|-------------|----------|
| Ingest API | `/api/ingest` | Entry point — receives records from iHOMIS or WAH |
| Consent-as-Code Gatekeeper | `ingest` pipeline | Scans for `consent_signed: true` flag; blocks if missing (HTTP 422) |
| Gemini AI Transformation Engine | `gemini.ts` | HL7 v2 → FHIR R4 and FHIR R4 → iHOMIS JSON translation |
| Model Juggling Logic | `gemini.ts` | Fallback chain: flash-lite → 2.5-flash-lite → 2.5-flash → 3-flash → 2.0-flash |
| FHIR R4 Validator | `validator.ts` | Validates FHIR bundles for required resource types (Patient, Encounter, Observation, Condition) |
| Quarantine Engine | `ingest` pipeline | Isolates rejected/invalid records for admin manual review |
| Sanitized Audit Logger | `ingest` pipeline | Logs all transactions (no PHI — only timestamps, UUIDs, status, facility names) |
| Monitoring Dashboard | `/dashboard` | Real-time metrics: total transactions, success rates, throughput |
| Transaction Logs Viewer | `/transactions` | View/search all transaction history |
| Metrics API | `/api/metrics` | Dashboard metric aggregations |
| Transaction API | `/api/transactions` | Transaction log retrieval |
| Database | `adapt_transaction_logs` | Supabase #3 — audit trail ONLY (no patient data stored permanently) |

**Transaction Status Flow:** `PENDING → TRANSFORMING → SUCCESS` (or `QUARANTINED`)

### 3.3 WAH Hospital — Modern FHIR R4 System (Port :3002)

**Technology:** Next.js 16 | TypeScript | Supabase (PostgreSQL + JSONB)

| Component | Path | Function |
|-----------|------|----------|
| Save Page | `/save` | Create FHIR R4 patient records with auto-fill |
| Records Page | `/records` | View, edit, delete records; move to Send Queue |
| Send Queue Page | `/send` | Queue and dispatch FHIR bundles to iHOMIS via iPaaS |
| Inbox Page | `/inbox` | Receive and review transformed records from iHOMIS |
| Patient CRUD API | `/api/patients` | REST API (GET / POST / PUT / DELETE) |
| FHIR Bundle Builder & Send API | `/api/send` | Constructs FHIR R4 Transaction Bundles, sends to iPaaS |
| Webhook Receiver | `/api/webhook` | Receives transformed data from iPaaS |
| Database | `wah_patients` | Supabase #2 — stores patient records in FHIR R4 Bundle + JSONB format |

**Record Status Flow:** `SAVED → QUEUED → SENT` (or `REJECTED`)

---

## 4. External Systems & Dependencies

| External System | Type | Relationship to WAH4PCE |
|----------------|------|------------------------|
| **Google Gemini AI** | Cloud AI Service | Powers the data transformation engine via `@google/generative-ai` SDK. Structured JSON output with temperature 0.1 for deterministic results. Model fallback chain for rate limit resilience. |
| **Supabase** (x3 projects) | Cloud Database (PostgreSQL + JSONB) | 3 isolated database projects — one per system node. Provides flexible JSONB payload storage for diverse health record formats. |
| **DOH / NHDR** | Government Endpoint | Target national repository. Currently on hold (deployment paused post-leadership change). WAH4PCE provides a proof-of-concept for future integration. |
| **PhilHealth** | Government Insurance | PhilHealth member ID is a mandatory field used as the patient identifier across systems. System validates PhilHealth ID presence before transmission. |
| **HL7 FHIR R4 & PH Core IG** | International/National Standard | The interoperability standard WAH4PCE translates to/from. PH Core profiles define Philippine-specific FHIR implementation requirements. |
| **HL7 v2.5** | Legacy Standard | The legacy format used by iHOMIS/DOH systems. WAH4PCE translates from/to this format. |
| **Proxmox VE** | Local Server Virtualization | Provided by WAH. Hosts the federated system on isolated virtual machines mimicking independent hospital networks. |
| **WAH for Security** | Parallel Project Group | Separate team providing VPN tunnels, TLS 1.2+ encryption, and security protocols. WAH4PCE integrates within their secure infrastructure. |

---

## 5. Key Data Flows

### 5.1 Flow A: iHOMIS → WAH (HL7 v2 → FHIR R4)

```
Doctor creates record in iHOMIS
    → System builds HL7 v2 message (MSH|PID|PV1|OBX|DG1|RF1)
    → POST to iPaaS /api/ingest
        → Consent check (consent_signed: true?)
            → ❌ No → QUARANTINED (HTTP 422)
            → ✅ Yes → Gemini AI transforms HL7 v2 → FHIR R4 Bundle
                → FHIR Validator checks structure
                    → ❌ Invalid → QUARANTINED
                    → ✅ Valid → Log transaction → Forward to WAH /api/webhook
                        → WAH stores record (status=RECEIVED)
                        → WAH Doctor reviews in Inbox
                        → iHOMIS marks record as SENT
```

### 5.2 Flow B: WAH → iHOMIS (FHIR R4 → iHOMIS JSON)

```
Doctor creates FHIR record in WAH
    → System packages FHIR R4 Bundle + original JSON
    → POST to iPaaS /api/ingest
        → Consent check (consent_signed: true?)
            → ❌ No → QUARANTINED (HTTP 422)
            → ✅ Yes → Gemini AI transforms FHIR R4 → iHOMIS flat JSON
                → Structural validation
                    → ❌ Invalid → QUARANTINED
                    → ✅ Valid → Log transaction → Forward to iHOMIS /api/webhook
                        → iHOMIS stores record (status=RECEIVED)
                        → iHOMIS Doctor reviews in Inbox
                        → WAH marks record as SENT
```

---

## 6. System Functions Summary

### 6.1 Data Transformation Functions

| ID | Function | Description |
|----|----------|-------------|
| F-T1 | HL7 v2 → FHIR R4 Transformation | AI converts pipe-delimited HL7 v2 messages into structured FHIR R4 Transaction Bundles |
| F-T2 | FHIR R4 → iHOMIS JSON Transformation | AI flattens rich FHIR resources into iHOMIS-compatible flat JSON records |
| F-T3 | Build HL7 v2 Message | Constructs HL7 v2 segments (MSH, PID, PV1, OBX, DG1, RF1) from iHOMIS JSON |
| F-T4 | Build FHIR R4 Transaction Bundle | Assembles FHIR resources (Patient, Encounter, Observation, Condition) into a transaction bundle |
| F-T5 | Model Juggling Logic | Automatic fallback chain when primary AI model hits rate limits (429/503) |
| F-T6 | Semantic Terminology Mapping | Maps clinical codes between systems (LOINC, ICD-10, PhilHealth identifiers) |
| F-T7 | PH Core Profile Compliance | Ensures output conforms to Philippine FHIR Implementation Guide profiles |

### 6.2 Validation & Consent Functions

| ID | Function | Description |
|----|----------|-------------|
| F-V1 | Consent-as-Code Gatekeeper | Automated checkpoint blocking transfers without valid consent flag (DPA compliance) |
| F-V2 | FHIR R4 Bundle Structural Validation | Checks for required resource types (Patient, Encounter, Observation, Condition) |
| F-V3 | Mandatory Field Check | Detects missing critical fields (e.g., PhilHealth ID) |
| F-V4 | Quarantine & Isolation Engine | Isolates rejected/invalid records for admin manual review |
| F-V5 | Sanitized Audit Logging | Logs all transactions without PHI (timestamps, UUIDs, status, facility names only) |
| F-V6 | Ephemeral Data Processing | Auto-purges raw patient data from middleware after successful delivery |

### 6.3 Record Management Functions

| ID | Function | Description |
|----|----------|-------------|
| F-R1 | Create Patient Record | Create new records with auto-fill option for synthetic test data |
| F-R2 | Read/View Patient Records | View records with search, status badges, JSON viewers |
| F-R3 | Update/Edit Patient Record | Inline editing before sending |
| F-R4 | Delete Patient Record | Delete with explicit confirmation modal |
| F-R5 | Move to Send Queue | Status transition: SAVED → QUEUED |
| F-R6 | Send Record to Destination | Dispatch via iPaaS: QUEUED → SENT |
| F-R7 | Revert Record | Status transition: QUEUED → SAVED |
| F-R8 | Re-queue Rejected Record | Status transition: REJECTED → QUEUED |
| F-I1 | Receive Incoming Record | Webhook receives and stores transformed record |
| F-I2 | View Data Comparison | 4-mode visualizer (Field Summary, Transformed, Original, Compare) |
| F-I3 | Accept Record | Move received record to active records |
| F-I4 | Delete Received Record | Remove unwanted received records |

---

## 7. Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| **Federated (not centralized) architecture** | Mitigates single-point-of-failure risk. Each hospital retains data ownership. iPaaS stores only audit logs — no patient data. |
| **AI-powered translation (not rigid rules)** | Gemini AI handles semantic mapping between fundamentally different data formats, allowing intelligent interpretation rather than brittle field-by-field rules. |
| **In-Context Learning (ICL) over traditional ML** | No need to train models on sensitive health data. AI understands formats based on real-time prompts and context. |
| **Ephemeral data processing** | Raw patient data is auto-purged from middleware after delivery, minimizing data exposure surface. |
| **Consent-as-Code** | Legal compliance (DPA RA 10173) is enforced programmatically — not manually — ensuring no unauthorized transfers. |
| **Model fallback chain** | Ensures zero-downtime during AI rate limiting by cycling through 5 Gemini models automatically. |
| **Supabase with JSONB** | Flexible schema accommodates both HL7 v2 and FHIR R4 formats without rigid table structures. |

---

## 8. Compliance & Standards

| Standard/Law | How the System Complies |
|-------------|------------------------|
| **Universal Health Care Act (RA 11223)** | Provides proof-of-concept for mandated health information exchange between hospital systems |
| **Data Privacy Act of 2012 (RA 10173)** | Consent-as-Code gatekeeper, ephemeral processing, sanitized audit logs, no PHI in middleware |
| **DOH-PHIC JAO 2021-0002** | Implements National Health Data Standards via PH Core IG profiles and FHIR R4 compliance |
| **HL7 FHIR R4 (4.0.1)** | Full structural compliance for WAH-side data; transformation target for iHOMIS-side data |
| **PH Core Implementation Guide** | Philippine-specific FHIR profiles applied to all transformed records |

---

## 9. Diagram File Inventory

| File | Location | Description |
|------|----------|-------------|
| `system_context_full.puml` | `diagrams/` | ✅ **COMBINED** — Full System Context Diagram (everything in one view) |
| `external_actors.puml` | `diagrams/actors/` | External actors & users |
| `ihomis_system.puml` | `diagrams/systems/` | iHOMIS (DOH Legacy System) component |
| `adapt_ipaas_system.puml` | `diagrams/systems/` | ADAPT iPaaS Middleware component |
| `wah_hospital_system.puml` | `diagrams/systems/` | WAH Hospital (FHIR R4) component |
| `external_dependencies.puml` | `diagrams/external_systems/` | External systems (Gemini, Supabase, DOH, PhilHealth, etc.) |
| `data_transformation.puml` | `diagrams/functions/` | AI-powered format translation functions |
| `validation_consent.puml` | `diagrams/functions/` | Validation engine & consent gatekeeper functions |
| `record_management.puml` | `diagrams/functions/` | CRUD, Send Queue, Inbox workflow functions |

---

*Document generated for WAH4PCE — Merge Conflict | AY 2025-2026*
