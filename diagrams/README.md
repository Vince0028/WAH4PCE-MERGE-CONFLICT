# 📊 WAH4PCE System Context Diagrams (PlantUML)
**PlantUML (.puml)** System Context Diagrams for the WAH4PCE — ADAPT LHIE Interoperability System.

## 📁 Folder Structure

```
diagrams/
├── README.md                           ← This file
├── component_diagram/adapt_ipaas_component_diagram.puml           ← ⭐ ADAPT iPaaS ONLY: What our group built (Simple view)
├── system_context_full.puml            ← ✅ COMBINED: Full System Overview (All 3 Systems)
├── system_context_simple.puml          ← 🟦 HIGH-LEVEL: True System Context Diagram (Level 1)
├── flow_doh_to_wah.puml                ← 🔄 Prototype flow: DOH sending to WAH (Figma match)
├── flow_wah_to_doh.puml                ← 🔄 Prototype flow: WAH sending to DOH (Figma match)
│
├── actors/
│   └── external_actors.puml            ← External actors & users (UCD Style Layout)
│
├── systems/
│   ├── system_context_diagram/adapt_ipaas_system_context_diagram.puml         ← ADAPT iPaaS Middleware
│   └── wah_hospital_system.puml        ← WAH Hospital (Modern FHIR System)
│
├── external_systems/
│   └── external_dependencies.puml      ← External services (Gemini AI, Supabase, DOH, etc.)
│
└── functions/
    ├── data_transformation.puml        ← How AI converts the health records
    ├── validation_consent.puml         ← How ADAPT checks data quality and privacy
    └── record_management.puml          ← How doctors manage and receive records
```

## 🚀 How to Render

### Option 1: PlantUML Online Server
1. Go to [plantuml.com/plantext](http://www.plantuml.com/plantuml/uml/)
2. Paste the contents of any `.puml` file
3. Click "Submit" to render

### Option 2: VS Code Extension
1. Install the **PlantUML** extension (`jebbs.plantuml`)
2. Open any `.puml` file
3. Press `Alt+D` to preview

### Option 3: Command Line
```bash
java -jar plantuml.jar system_context_simple.puml
```

## 📌 Key Diagrams Explained

**🟦 `system_context_simple.puml`** — This is the ultra-simple, high-level "System Context Diagram" meant for professors and non-technical stakeholders. It hides all internal pipelines and just shows WAH, PAAS, iHOMIS, and the AI Layer interacting.

**🔄 `flow_doh_to_wah.puml` / `flow_wah_to_doh.puml`** — These flowcharts exactly match the prototype visualizations you created in Figma, tracking the step-by-step movement of data.

**⭐ `component_diagram/adapt_ipaas_component_diagram.puml` & `system_context_full.puml`** — These are the full diagrams detailing what your group built, but they have been rewritten to use **simple, everyday language** (e.g. "Check if patient gave consent" instead of "Consent-as-Code Gatekeeper").
