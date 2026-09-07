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

// ============================================
// System Prompts for all format pairs
// ============================================

const HL7V2_TO_FHIR_PROMPT = `You are a healthcare data transformation engine for the Philippine Local Health Information Exchange (LHIE).

Your task: Convert the following HL7 v2.x message (pipe-delimited segments: MSH, PID, PV1, OBX, DG1, RF1) into a FULLY VALID PH Core HL7 FHIR R4 Transaction Bundle.

HL7 v2 segment reference:
- MSH: Message Header (sending facility, timestamp)
- PID: Patient ID, name (format: LASTNAME^FIRSTNAME^MIDDLENAME), DOB, sex, address, PhilHealth number
- PV1: Patient Visit (class, attending physician, priority)
- OBX: Observation (vital signs with LOINC codes)
- DG1: Diagnosis (ICD-10 code, description, chief complaint)
- RF1: Referral info (priority, reason, facility)

The output FHIR Bundle MUST contain:
1. **Patient**:
   - name.given[0]: FIRSTNAME
   - name.given[1]: MIDDLENAME (Important: Do not omit the middle name)
   - name.family: LASTNAME
   - identifier: PhilHealth (system: "https://www.philhealth.gov.ph/memberid")
   - telecom[0]: phone number from PID (system: "phone", value: the contact number from the last field of PID)
   - address: from PID (line, city, district/province, postalCode, country)
2. **Encounter**:
   - class, priority, participant (attending physician)
   - serviceProvider.display: sending facility from RF1 or PV1
   - reasonCode[0].text: referral reason from RF1
3. **Observation**: resources for each OBX segment (vital signs with LOINC codes, units of measure)
4. **Condition**:
   - code: ICD-10 coding from DG1
   - note[0].text: chief complaint from the last field of DG1

Bundle: type "transaction", fullUrl using "urn:uuid:" format, request with method "POST".
Output ONLY valid JSON. No markdown, no code fences, no explanation.`;

const FHIR_TO_HL7V2_PROMPT = `You are a healthcare data transformation engine for the Philippine Local Health Information Exchange (LHIE).

Your task: Convert the following PH Core HL7 FHIR R4 Bundle into a flat JSON format compatible with HL7 v2 systems.

Extract data from the FHIR Bundle resources (Patient, Encounter, Observation, Condition) and map them to this EXACT structure:

{
  "patient_fname": "from Patient.name[0].given[0]",
  "patient_lname": "from Patient.name[0].family",
  "patient_mname": "from Patient.name[0].given[1] or empty string",
  "patient_suffix": "from Patient.name[0].suffix[0] or empty string",
  "dob": "Patient.birthDate in YYYY-MM-DD",
  "sex": "M or F from Patient.gender (male=M, female=F)",
  "civil_status": "S/M/W/D from Patient.maritalStatus",
  "philhealth_no": "from Patient.identifier where system contains philhealth",
  "contact_no": "from Patient.telecom where system is phone",
  "address_street": "from Patient.address[0].line[0]",
  "address_barangay": "from Patient.address[0].line[1] or empty",
  "address_city": "from Patient.address[0].city",
  "address_province": "from Patient.address[0].district",
  "address_zip": "from Patient.address[0].postalCode",
  "vitals": {
    "bp_systolic": "number from BP component LOINC 8480-6",
    "bp_diastolic": "number from BP component LOINC 8462-4",
    "heart_rate": "number from LOINC 8867-4",
    "temperature": "number from LOINC 8310-5",
    "respiratory_rate": "number from LOINC 9279-1",
    "oxygen_saturation": "number from LOINC 2708-6 or null",
    "weight_kg": "number from LOINC 29463-7",
    "height_cm": "number from LOINC 8302-2"
  },
  "chief_complaint": "from Condition.note or Encounter.reasonCode",
  "diagnosis_code": "ICD-10 code from Condition.code.coding",
  "diagnosis_desc": "display from Condition.code",
  "diagnosis_type": "admitting/final/working from Condition.verificationStatus",
  "referring_facility_code": "from Encounter.serviceProvider or generate",
  "referring_facility_name": "from Encounter.serviceProvider display",
  "referring_physician": "from Encounter.participant display",
  "referring_physician_license": "from identifier or empty",
  "referral_reason": "from Encounter.reasonCode text",
  "priority": "ROUTINE/URGENT/EMERGENCY from Encounter.priority"
}

All numeric vitals must be numbers, not strings. Missing fields should use empty string or 0.
Output ONLY valid JSON. No markdown, no code fences, no explanation.`;


// ============================================
// Format type definitions
// ============================================
export type DataFormat = 'HL7V2' | 'FHIR_R4';
export type TransformDirection =
  | 'HL7V2_TO_FHIR_R4'
  | 'FHIR_R4_TO_HL7V2'
  // Legacy aliases
  | 'IHOMIS_TO_FHIR'
  | 'FHIR_TO_IHOMIS';

function getPromptForDirection(direction: TransformDirection): string {
  switch (direction) {
    case 'HL7V2_TO_FHIR_R4':
    case 'IHOMIS_TO_FHIR':
      return HL7V2_TO_FHIR_PROMPT;
    case 'FHIR_R4_TO_HL7V2':
    case 'FHIR_TO_IHOMIS':
      return FHIR_TO_HL7V2_PROMPT;
    default:
      return HL7V2_TO_FHIR_PROMPT;
  }
}

/**
 * Determine the transformation direction from source and destination formats.
 */
export function getTransformDirection(sourceFormat: DataFormat, destFormat: DataFormat): TransformDirection {
  const key = `${sourceFormat}_TO_${destFormat}`;
  const validDirections: Record<string, TransformDirection> = {
    'HL7V2_TO_FHIR_R4': 'HL7V2_TO_FHIR_R4',
    'FHIR_R4_TO_HL7V2': 'FHIR_R4_TO_HL7V2',
  };
  return validDirections[key] || 'HL7V2_TO_FHIR_R4';
}

/**
 * Transform data using AI with automatic model fallback juggling.
 * If Gemini hits quota, it instantly falls back to Groq LPU models.
 */
export async function transformWithAI(
  payload: unknown,
  direction: TransformDirection
): Promise<{ success: boolean; data: Record<string, unknown> | null; error: string | null; usedModel?: string }> {
  const systemPrompt = getPromptForDirection(direction);

  const inputData = typeof payload === 'string'
    ? payload
    : JSON.stringify(payload, null, 2);

  var prompt = systemPrompt + '\n\nInput Data:\n' + inputData;

  // Deduplicate model list while preserving order
  var models = MODEL_FALLBACKS.filter(function(v, i, a) { return a.findIndex(function(t) { return t.model === v.model; }) === i; });

  for (var idx = 0; idx < models.length; idx++) {
    var provider = models[idx].provider;
    var modelName = models[idx].model;
    try {
      console.log('[AI] Trying ' + provider + ' model: ' + modelName + ' for ' + direction + '...');

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
          model: modelName,
          temperature: 0.1,
          response_format: { type: 'json_object' as const },
        });
        responseText = completion.choices[0]?.message?.content || '';
      } else {
        console.warn('[AI] Provider ' + provider + ' not configured (missing API key)');
        continue;
      }

      if (!responseText) throw new Error('Empty response');

      var parsedData = JSON.parse(responseText);
      console.log('[AI] Transformation successful using ' + provider + ' (' + modelName + ')');
      return { success: true, data: parsedData, error: null, usedModel: modelName };

    } catch (error) {
      var errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn('[AI] ' + provider + ' (' + modelName + ') failed: ' + errorMessage + '. Juggling to next...');
      continue;
    }
  }

  // All models exhausted
  return {
    success: false,
    data: null,
    error: 'All AI models (Gemini and Groq) exhausted or failed. Check API keys or wait for quota reset.',
  };
}
