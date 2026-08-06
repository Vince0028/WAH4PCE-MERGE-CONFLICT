/**
 * FHIR, HL7v2 & CDA R2 Payload Validator
 * Checks for mandatory fields before forwarding
 */

import type { TransformDirection } from './ai';

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a FHIR Bundle output (→ FHIR R4 transformation)
 */
export function validateFHIRBundle(data: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  // Check it's a Bundle
  if (data.resourceType !== 'Bundle') {
    errors.push('Root resourceType must be "Bundle"');
  }

  // Check it has entries
  const entries = data.entry as Array<Record<string, unknown>> | undefined;
  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    errors.push('Bundle must contain at least one entry');
  } else {
    // Check for required resource types
    const resourceTypes = entries.map(
      (e) => (e.resource as Record<string, unknown>)?.resourceType
    );

    if (!resourceTypes.includes('Patient')) {
      errors.push('Bundle must contain a Patient resource');
    }
    if (!resourceTypes.includes('Encounter')) {
      errors.push('Bundle must contain an Encounter resource');
    }
    if (!resourceTypes.includes('Condition')) {
      errors.push('Bundle must contain a Condition resource');
    }

    // Check Patient has PhilHealth ID
    const patientEntry = entries.find(
      (e) => (e.resource as Record<string, unknown>)?.resourceType === 'Patient'
    );
    if (patientEntry) {
      const patient = patientEntry.resource as Record<string, unknown>;
      const identifiers = patient.identifier as Array<Record<string, unknown>> | undefined;
      const hasPhilHealth = identifiers?.some(
        (id) => id.system === 'https://www.philhealth.gov.ph/memberid' && id.value
      );
      if (!hasPhilHealth) {
        errors.push('Patient must have a PhilHealth identifier');
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate an HL7v2 flat JSON output (FHIR → HL7v2 transformation)
 */
export function validateHL7V2Payload(data: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  const requiredFields = [
    'patient_fname',
    'patient_lname',
    'dob',
    'sex',
    'philhealth_no',
    'diagnosis_code',
    'referring_facility_name',
  ];

  for (const field of requiredFields) {
    if (!data[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Check vitals object exists
  if (!data.vitals || typeof data.vitals !== 'object') {
    errors.push('Missing or invalid vitals object');
  } else {
    const vitals = data.vitals as Record<string, unknown>;
    const requiredVitals = ['bp_systolic', 'bp_diastolic', 'heart_rate', 'temperature'];
    for (const vital of requiredVitals) {
      if (vitals[vital] === undefined || vitals[vital] === null) {
        errors.push(`Missing vital sign: ${vital}`);
      }
    }
  }

  // Validate PhilHealth number format (basic check)
  if (data.philhealth_no && typeof data.philhealth_no === 'string') {
    if (data.philhealth_no.length < 6) {
      errors.push('PhilHealth number appears invalid (too short)');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a CDA R2 JSON output (FHIR → CDA R2 transformation)
 */
export function validateCDAR2Payload(data: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  // Check document type marker
  if (data.documentType !== 'CDA_R2') {
    errors.push('documentType must be "CDA_R2"');
  }

  // Check recordTarget exists
  const recordTarget = data.recordTarget as Record<string, unknown> | undefined;
  if (!recordTarget) {
    errors.push('Missing recordTarget (patient information)');
  } else {
    const patientRole = recordTarget.patientRole as Record<string, unknown> | undefined;
    if (!patientRole) {
      errors.push('Missing patientRole in recordTarget');
    } else {
      // Check patient identity
      const id = patientRole.id as Record<string, unknown> | undefined;
      if (!id || !id.extension) {
        errors.push('Missing patient PhilHealth ID (patientRole.id.extension)');
      }

      const patient = patientRole.patient as Record<string, unknown> | undefined;
      if (!patient) {
        errors.push('Missing patient demographics');
      } else {
        const name = patient.name as Record<string, unknown> | undefined;
        if (!name || !name.family) {
          errors.push('Missing patient family name');
        }
      }
    }
  }

  // Check component/structuredBody exists
  const component = data.component as Record<string, unknown> | undefined;
  if (!component || !component.structuredBody) {
    errors.push('Missing component/structuredBody');
  }

  return { valid: errors.length === 0, errors };
}

// Legacy alias for backward compatibility
export function validateIHOMISPayload(data: Record<string, unknown>): ValidationResult {
  return validateHL7V2Payload(data);
}

/**
 * Validate based on transformation direction
 */
export function validateTransformation(
  data: Record<string, unknown>,
  direction: TransformDirection | 'IHOMIS_TO_FHIR' | 'FHIR_TO_IHOMIS'
): ValidationResult {
  switch (direction) {
    case 'HL7V2_TO_FHIR_R4':
    case 'CDA_R2_TO_FHIR_R4':
    case 'IHOMIS_TO_FHIR':
      return validateFHIRBundle(data);
    case 'FHIR_R4_TO_HL7V2':
    case 'FHIR_TO_IHOMIS':
      return validateHL7V2Payload(data);
    case 'FHIR_R4_TO_CDA_R2':
      return validateCDAR2Payload(data);
    default:
      return validateFHIRBundle(data);
  }
}
