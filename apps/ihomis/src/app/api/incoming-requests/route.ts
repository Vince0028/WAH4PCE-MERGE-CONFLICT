import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * POST /api/incoming-requests — Receive a data request from iPaaS (WAH requesting data from iHOMIS)
 * Searches ihomis_patients and responds with matching patient data.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { requesting_system, philhealth_no, patient_name, ipaas_transaction_id } = body;

    console.log(`[iHOMIS Incoming] ${requesting_system || 'WAH'} requesting data (PhilHealth: ${philhealth_no || 'N/A'}, Name: ${patient_name || 'N/A'})`);

    // Search for matching patient in ihomis_patients
    let query = supabaseAdmin.from('ihomis_patients').select('*');

    if (philhealth_no) {
      query = query.eq('philhealth_no', philhealth_no);
    } else if (patient_name) {
      query = query.ilike('patient_name', `%${patient_name}%`);
    } else {
      return NextResponse.json({ success: false, message: 'No search criteria provided' }, { status: 400 });
    }

    const { data: patients, error } = await query;

    if (error) {
      console.error('[iHOMIS Incoming] DB search error:', error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    if (!patients || patients.length === 0) {
      console.log('[iHOMIS Incoming] No matching patient found.');
      return NextResponse.json({
        success: false,
        message: 'No matching patient found in iHOMIS records',
      }, { status: 404 });
    }

    // Return the first matching patient's data
    const patient = patients[0];
    console.log(`[iHOMIS Incoming] Found patient: ${patient.patient_name} (${patient.id})`);

    return NextResponse.json({
      success: true,
      message: 'Patient found',
      data: {
        patient_id: patient.id,
        patient_name: patient.patient_name,
        philhealth_no: patient.philhealth_no,
        hl7v2_payload: patient.hl7v2_payload,
        consent_signed: patient.consent_signed,
        ipaas_transaction_id,
      },
    });
  } catch (error) {
    console.error('[iHOMIS Incoming] Error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
