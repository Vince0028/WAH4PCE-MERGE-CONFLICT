import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/patients — Fetch patient records for an org
 * POST /api/patients — Save a new patient record
 * PUT /api/patients — Update an existing record
 * DELETE /api/patients — Delete a record
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('org_id');
    const source = searchParams.get('source');
    const status = searchParams.get('status');
    const id = searchParams.get('id');

    if (id) {
      const { data, error } = await supabaseAdmin.from('org_patients').select('*').eq('id', id).single();
      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 404 });
      return NextResponse.json({ success: true, data });
    }

    if (!orgId) {
      return NextResponse.json({ success: false, message: 'org_id is required' }, { status: 400 });
    }

    let query = supabaseAdmin.from('org_patients').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
    if (source) query = query.eq('source', source);
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Portal API] Error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { org_id, patient_data, consent_signed } = body;

    if (!org_id) {
      return NextResponse.json({ success: false, message: 'org_id is required' }, { status: 400 });
    }

    // Extract metadata from patient data for search/display
    const patientName = patient_data.patient_lname
      ? `${patient_data.patient_lname}, ${patient_data.patient_fname} ${patient_data.patient_mname || ''}`.trim()
      : patient_data.patient_name || 'Unknown';

    const { data, error } = await supabaseAdmin
      .from('org_patients')
      .insert({
        org_id,
        patient_name: patientName,
        philhealth_no: patient_data.philhealth_no || '',
        sex: patient_data.sex || '',
        dob: patient_data.dob || null,
        diagnosis_code: patient_data.diagnosis_code || '',
        diagnosis_desc: patient_data.diagnosis_desc || '',
        priority: patient_data.priority || 'ROUTINE',
        data_payload: patient_data,
        consent_signed: consent_signed ?? false,
        status: 'SAVED',
        source: 'LOCAL',
      })
      .select().single();

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    console.log(`[Portal] Patient saved: ${data.id} for org ${org_id}`);
    return NextResponse.json({ success: true, data, message: 'Patient record saved' });
  } catch (error) {
    console.error('[Portal Save] Error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ success: false, message: 'id is required' }, { status: 400 });

    const updateData: Record<string, unknown> = {};
    if (updates.status) updateData.status = updates.status;
    if (updates.consent_signed !== undefined) updateData.consent_signed = updates.consent_signed;
    if (updates.rejection_reason !== undefined) updateData.rejection_reason = updates.rejection_reason;

    if (updates.data_payload) {
      updateData.data_payload = updates.data_payload;
      const payload = updates.data_payload;
      if (payload.patient_lname) {
        updateData.patient_name = `${payload.patient_lname}, ${payload.patient_fname} ${payload.patient_mname || ''}`.trim();
      }
      updateData.philhealth_no = payload.philhealth_no;
      updateData.sex = payload.sex;
      updateData.dob = payload.dob || null;
      updateData.diagnosis_code = payload.diagnosis_code;
      updateData.diagnosis_desc = payload.diagnosis_desc;
      updateData.priority = payload.priority;
    }

    Object.keys(updateData).forEach(k => updateData[k] === undefined && delete updateData[k]);

    const { data, error } = await supabaseAdmin.from('org_patients').update(updateData).eq('id', id).select().single();
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data, message: 'Record updated' });
  } catch (error) {
    console.error('[Portal Update] Error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, message: 'id is required' }, { status: 400 });

    const { error } = await supabaseAdmin.from('org_patients').delete().eq('id', id);
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    console.log(`[Portal] Patient deleted: ${id}`);
    return NextResponse.json({ success: true, message: 'Record deleted' });
  } catch (error) {
    console.error('[Portal Delete] Error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
