import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const IPAAS_URL = process.env.IPAAS_API_URL || 'http://localhost:3000/api';

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('wah_outbound_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[WAH Outbound Requests] GET Error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { target_org, target_org_id, destination_format, philhealth_no, patient_name, request_reason } = body;

    if (!target_org || (!philhealth_no && !patient_name)) {
      return NextResponse.json({ success: false, message: 'Missing target_org or patient identifier' }, { status: 400 });
    }

    // 1. Create a PENDING request in WAH database
    const { data: newRequest, error: dbError } = await supabaseAdmin
      .from('wah_outbound_requests')
      .insert({
        target_org,
        target_org_id: target_org_id || null,
        destination_format: destination_format || 'FHIR_R4',
        philhealth_no: philhealth_no || null,
        patient_name: patient_name || null,
        request_reason: request_reason || null,
        status: 'PENDING',
      })
      .select()
      .single();

    if (dbError) {
      console.error('[WAH Outbound Requests] DB error:', dbError);
      return NextResponse.json({ success: false, message: 'Database error' }, { status: 500 });
    }

    // 2. Send the request to iPaaS
    try {
      const ipaasRes = await fetch(`${IPAAS_URL}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: newRequest.id,
          requesting_org: 'WAH',
          requesting_org_id: 'wah-id-1',
          target_org,
          target_org_id,
          destination_format,
          philhealth_no,
          patient_name,
          request_reason,
        }),
      });

      const ipaasData = await ipaasRes.json();
      if (!ipaasData.success) {
        await supabaseAdmin
          .from('wah_outbound_requests')
          .update({ status: 'FAILED', error_message: ipaasData.message || 'iPaaS rejected the request' })
          .eq('id', newRequest.id);
        
        return NextResponse.json({ success: false, message: ipaasData.message || 'iPaaS rejected request' }, { status: 502 });
      }
    } catch (err) {
      console.error('[WAH Outbound Requests] Failed to contact iPaaS:', err);
      await supabaseAdmin
        .from('wah_outbound_requests')
        .update({ status: 'FAILED', error_message: 'Failed to contact iPaaS' })
        .eq('id', newRequest.id);
      
      return NextResponse.json({ success: false, message: 'Failed to route request via iPaaS' }, { status: 502 });
    }

    return NextResponse.json({ success: true, message: 'Request sent successfully', data: newRequest });
  } catch (error) {
    console.error('[WAH Outbound Requests] POST Error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
