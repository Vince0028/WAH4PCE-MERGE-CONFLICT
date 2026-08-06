import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/patients/search
 * Allows the iPaaS to fetch patient records by PhilHealth No. or Name.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const philhealth_no = searchParams.get('philhealth_no');
    const name = searchParams.get('name');

    if (!philhealth_no && !name) {
      return NextResponse.json({ success: false, message: 'PhilHealth number or Name is required' }, { status: 400 });
    }

    let query = supabaseAdmin.from('wah_patients').select('*');

    if (philhealth_no) {
      query = query.eq('philhealth_no', philhealth_no);
    } else if (name) {
      query = query.ilike('patient_name', `%${name}%`);
    }

    const { data: record, error } = await query.limit(1).single();

    if (error || !record) {
      return NextResponse.json({ success: false, message: 'Patient not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: record });
  } catch (error) {
    console.error('[WAH Search API] Error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
