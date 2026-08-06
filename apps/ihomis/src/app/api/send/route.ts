import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const IPAAS_URL = process.env.NEXT_PUBLIC_IPAAS_API_URL || 'http://localhost:3000/api';

/**
 * Build an HL7 v2 message from patient data
 */
function buildHL7v2Message(patient: Record<string, unknown>): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const vitals = (patient.vitals || {}) as Record<string, number>;

  const segments = [
    `MSH|^~\\&|PORTAL|${patient.referring_facility_code || 'ORG-001'}|ADAPT_IPAAS|ADAPT|${ts}||ADT^A01|MSG${Date.now()}|P|2.5`,
    `PID|1||${patient.philhealth_no}^^^PhilHealth^SB||${patient.patient_lname}^${patient.patient_fname}^${patient.patient_mname || ''}^^^${patient.patient_suffix || ''}||${(patient.dob as string || '').replace(/-/g, '')}|${patient.sex}|||${patient.address_street || ''}^^${patient.address_city || ''}^${patient.address_province || ''}^${patient.address_zip || ''}^PH|||${patient.civil_status || 'S'}|||||||||||||||${patient.contact_no || ''}`,
    `PV1|1|O|${patient.referring_facility_code || 'ORG-001'}|||||||${patient.referring_physician || ''}^${patient.referring_physician_license || ''}||||||||||||||||||||||||||||||${patient.priority || 'ROUTINE'}`,
  ];

  let obxSeq = 1;
  if (vitals.bp_systolic) segments.push(`OBX|${obxSeq++}|NM|8480-6^Systolic Blood Pressure^LN||${vitals.bp_systolic}|mmHg|||||F|||${ts}`);
  if (vitals.bp_diastolic) segments.push(`OBX|${obxSeq++}|NM|8462-4^Diastolic Blood Pressure^LN||${vitals.bp_diastolic}|mmHg|||||F|||${ts}`);
  if (vitals.heart_rate) segments.push(`OBX|${obxSeq++}|NM|8867-4^Heart Rate^LN||${vitals.heart_rate}|/min|||||F|||${ts}`);
  if (vitals.temperature) segments.push(`OBX|${obxSeq++}|NM|8310-5^Body Temperature^LN||${vitals.temperature}|Cel|||||F|||${ts}`);
  if (vitals.respiratory_rate) segments.push(`OBX|${obxSeq++}|NM|9279-1^Respiratory Rate^LN||${vitals.respiratory_rate}|/min|||||F|||${ts}`);
  if (vitals.oxygen_saturation) segments.push(`OBX|${obxSeq++}|NM|2708-6^Oxygen Saturation^LN||${vitals.oxygen_saturation}|%|||||F|||${ts}`);
  if (vitals.weight_kg) segments.push(`OBX|${obxSeq++}|NM|29463-7^Body Weight^LN||${vitals.weight_kg}|kg|||||F|||${ts}`);
  if (vitals.height_cm) segments.push(`OBX|${obxSeq++}|NM|8302-2^Body Height^LN||${vitals.height_cm}|cm|||||F|||${ts}`);

  if (patient.diagnosis_code) {
    segments.push(`DG1|1||${patient.diagnosis_code}^${patient.diagnosis_desc}^I10|||${patient.diagnosis_type || 'A'}||||||||${patient.chief_complaint || ''}`);
  }

  segments.push(`RF1|${patient.priority || 'ROUTINE'}|${patient.referral_reason || ''}||${patient.referring_facility_name || ''}|${ts}`);

  return segments.join('\r');
}

/**
 * Build a FHIR R4 Bundle from patient data (for orgs using FHIR_R4 format)
 */
function buildFHIRBundle(patient: Record<string, unknown>): Record<string, unknown> {
  const vitals = (patient.vitals || {}) as Record<string, number>;

  return {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: [
      {
        fullUrl: `urn:uuid:patient-${Date.now()}`,
        resource: {
          resourceType: 'Patient',
          meta: { profile: ['http://fhir.ph/StructureDefinition/ph-core-patient'] },
          identifier: [{ system: 'https://www.philhealth.gov.ph/memberid', value: patient.philhealth_no }],
          name: [{ family: patient.patient_lname, given: [patient.patient_fname, patient.patient_mname].filter(Boolean) }],
          gender: patient.sex === 'M' ? 'male' : 'female',
          birthDate: patient.dob,
          address: [{ line: [patient.address_street, patient.address_barangay].filter(Boolean), city: patient.address_city, district: patient.address_province, postalCode: patient.address_zip }],
          telecom: patient.contact_no ? [{ system: 'phone', value: patient.contact_no }] : [],
        },
        request: { method: 'POST', url: 'Patient' },
      },
      {
        fullUrl: `urn:uuid:encounter-${Date.now()}`,
        resource: {
          resourceType: 'Encounter',
          status: 'finished',
          class: { code: 'AMB' },
          priority: { coding: [{ code: patient.priority || 'ROUTINE' }] },
          reasonCode: [{ text: patient.chief_complaint || patient.referral_reason || '' }],
          serviceProvider: { display: patient.referring_facility_name },
          participant: [{ individual: { display: patient.referring_physician } }],
        },
        request: { method: 'POST', url: 'Encounter' },
      },
      {
        fullUrl: `urn:uuid:condition-${Date.now()}`,
        resource: {
          resourceType: 'Condition',
          code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: patient.diagnosis_code, display: patient.diagnosis_desc }] },
        },
        request: { method: 'POST', url: 'Condition' },
      },
      ...(vitals.bp_systolic ? [{
        fullUrl: `urn:uuid:obs-bp-${Date.now()}`,
        resource: {
          resourceType: 'Observation',
          status: 'final',
          code: { coding: [{ system: 'http://loinc.org', code: '85354-9', display: 'Blood pressure' }] },
          component: [
            { code: { coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic' }] }, valueQuantity: { value: vitals.bp_systolic, unit: 'mmHg' } },
            { code: { coding: [{ system: 'http://loinc.org', code: '8462-4', display: 'Diastolic' }] }, valueQuantity: { value: vitals.bp_diastolic, unit: 'mmHg' } },
          ],
        },
        request: { method: 'POST', url: 'Observation' },
      }] : []),
    ],
  };
}

/**
 * Build a CDA R2 XML document from patient data
 */
function buildCDADocument(patient: Record<string, unknown>): string {
  const vitals = (patient.vitals || {}) as Record<string, number>;
  const now = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);

  return `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>
  <id root="2.16.840.1.113883.19" extension="DOC-${Date.now()}"/>
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1" displayName="Summarization of Episode Note"/>
  <effectiveTime value="${now}"/>
  <recordTarget>
    <patientRole>
      <id root="2.16.840.1.113883.4.3.608" extension="${patient.philhealth_no || ''}"/>
      <patient>
        <name>
          <given>${patient.patient_fname || ''}</given>
          <given>${patient.patient_mname || ''}</given>
          <family>${patient.patient_lname || ''}</family>
        </name>
        <administrativeGenderCode code="${patient.sex || 'M'}" codeSystem="2.16.840.1.113883.5.1"/>
        <birthTime value="${(patient.dob as string || '').replace(/-/g, '')}"/>
      </patient>
    </patientRole>
  </recordTarget>
  <author>
    <assignedAuthor>
      <assignedPerson><name>${patient.referring_physician || ''}</name></assignedPerson>
      <representedOrganization><name>${patient.referring_facility_name || ''}</name></representedOrganization>
    </assignedAuthor>
  </author>
  <component>
    <structuredBody>
      <component>
        <section>
          <code code="8716-3" codeSystem="2.16.840.1.113883.6.1" displayName="Vital Signs"/>
          <entry>
            <organizer classCode="CLUSTER" moodCode="EVN">
              ${vitals.bp_systolic ? `<component><observation classCode="OBS" moodCode="EVN"><code code="8480-6" codeSystem="2.16.840.1.113883.6.1" displayName="Systolic BP"/><value xsi:type="PQ" value="${vitals.bp_systolic}" unit="mmHg"/></observation></component>` : ''}
              ${vitals.bp_diastolic ? `<component><observation classCode="OBS" moodCode="EVN"><code code="8462-4" codeSystem="2.16.840.1.113883.6.1" displayName="Diastolic BP"/><value xsi:type="PQ" value="${vitals.bp_diastolic}" unit="mmHg"/></observation></component>` : ''}
              ${vitals.heart_rate ? `<component><observation classCode="OBS" moodCode="EVN"><code code="8867-4" codeSystem="2.16.840.1.113883.6.1" displayName="Heart Rate"/><value xsi:type="PQ" value="${vitals.heart_rate}" unit="/min"/></observation></component>` : ''}
              ${vitals.temperature ? `<component><observation classCode="OBS" moodCode="EVN"><code code="8310-5" codeSystem="2.16.840.1.113883.6.1" displayName="Body Temperature"/><value xsi:type="PQ" value="${vitals.temperature}" unit="Cel"/></observation></component>` : ''}
            </organizer>
          </entry>
        </section>
      </component>
      <component>
        <section>
          <code code="29308-4" codeSystem="2.16.840.1.113883.6.1" displayName="Diagnosis"/>
          <entry>
            <act classCode="ACT" moodCode="EVN">
              <code code="${patient.diagnosis_code || ''}" codeSystem="2.16.840.1.113883.6.3" displayName="${patient.diagnosis_desc || ''}"/>
              <text>${patient.chief_complaint || ''}</text>
            </act>
          </entry>
        </section>
      </component>
    </structuredBody>
  </component>
</ClinicalDocument>`;
}

/**
 * POST /api/send — Send a saved patient record to WAH via iPaaS
 * Automatically formats data based on the org's data_format
 */
export async function POST(request: NextRequest) {
  try {
    const { patient_id, org_id } = await request.json();

    if (!patient_id || !org_id) {
      return NextResponse.json({ success: false, message: 'patient_id and org_id are required' }, { status: 400 });
    }

    // Fetch patient record
    const { data: patient, error: fetchError } = await supabaseAdmin
      .from('org_patients')
      .select('*')
      .eq('id', patient_id)
      .single();

    if (fetchError || !patient) {
      return NextResponse.json({ success: false, message: 'Patient record not found' }, { status: 404 });
    }

    // Fetch org to get data format
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('*')
      .eq('id', org_id)
      .single();

    if (orgError || !org) {
      return NextResponse.json({ success: false, message: 'Organization not found' }, { status: 404 });
    }

    // Build payload in org's format
    const patientData = patient.data_payload || patient;
    let payload: unknown;
    const sourceFormat = org.data_format;

    switch (sourceFormat) {
      case 'HL7V2':
        payload = buildHL7v2Message(patientData);
        break;
      case 'FHIR_R4':
        payload = buildFHIRBundle(patientData);
        break;
      case 'CDA_R2':
        payload = buildCDADocument(patientData);
        break;
      default:
        payload = patientData;
    }

    console.log(`[Portal Send] Sending ${sourceFormat} data for patient ${patient_id} from ${org.name}...`);

    // Send to iPaaS for transformation
    const ipaasRes = await fetch(`${IPAAS_URL}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_system: org.name,
        destination_system: 'WAH',
        source_format: sourceFormat,
        destination_format: 'FHIR_R4',
        payload,
        original_json: patientData,
        consent_signed: patient.consent_signed ?? false,
      }),
    });

    const ipaasData = await ipaasRes.json();

    if (ipaasData.success) {
      await supabaseAdmin
        .from('org_patients')
        .update({ status: 'SENT' })
        .eq('id', patient_id);

      console.log(`[Portal Send] Success. TX: ${ipaasData.transaction_id}`);
    } else {
      await supabaseAdmin
        .from('org_patients')
        .update({
          status: 'REJECTED',
          rejection_reason: ipaasData.message || 'Rejected by iPaaS',
        })
        .eq('id', patient_id);

      console.warn(`[Portal Send] Record ${patient_id} REJECTED: ${ipaasData.message}`);
    }

    return NextResponse.json({
      success: ipaasData.success,
      transaction_id: ipaasData.transaction_id,
      status: ipaasData.success ? 'SENT' : 'REJECTED',
      message: ipaasData.success
        ? `${sourceFormat} data sent via iPaaS (TX: ${ipaasData.transaction_id?.slice(0, 8)})`
        : ipaasData.message || 'Failed to send',
    });
  } catch (error) {
    console.error('[Portal Send] Error:', error);
    return NextResponse.json({ success: false, message: 'Failed to connect to iPaaS' }, { status: 500 });
  }
}
