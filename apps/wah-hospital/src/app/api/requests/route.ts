import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('wah_incoming_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[WAH Requests] GET Error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { request_id, requesting_org, requesting_org_id, destination_format, philhealth_no, patient_name, ipaas_transaction_id } = body;

    const { data, error } = await supabaseAdmin
      .from('wah_incoming_requests')
      .insert({
        request_id: request_id || null,
        requesting_org,
        requesting_org_id: requesting_org_id || null,
        destination_format: destination_format || 'HL7V2',
        philhealth_no: philhealth_no || null,
        patient_name: patient_name || null,
        ipaas_transaction_id: ipaas_transaction_id || null,
        status: 'PENDING',
      })
      .select()
      .single();

    if (error) {
      console.error('[WAH Requests] DB insert error:', error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Request logged successfully', data });
  } catch (error) {
    console.error('[WAH Requests] POST Error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { id, status } = await request.json();
    
    if (!id || !status) {
      return NextResponse.json({ success: false, message: 'Missing id or status' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('wah_incoming_requests')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[WAH Requests] DB update error:', error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: true, message: 'Request updated', data });
  } catch (error) {
    console.error('[WAH Requests] PUT Error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
