import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const IPAAS_URL = process.env.NEXT_PUBLIC_IPAAS_API_URL || 'http://localhost:3000/api';

/**
 * GET /api/request — List data requests for an org
 * POST /api/request — Submit a new data request to WAH
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('org_id');
    const status = searchParams.get('status');

    if (!orgId) {
      return NextResponse.json({ success: false, message: 'org_id is required' }, { status: 400 });
    }

    let query = supabaseAdmin
      .from('data_requests')
      .select('*')
      .eq('requesting_org_id', orgId)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Portal Request API] Error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { org_id, philhealth_no, patient_name, request_reason } = body;

    if (!org_id) {
      return NextResponse.json({ success: false, message: 'org_id is required' }, { status: 400 });
    }

    if (!philhealth_no && !patient_name) {
      return NextResponse.json({ success: false, message: 'PhilHealth number or patient name is required' }, { status: 400 });
    }

    // Fetch the org to get its data format
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('*')
      .eq('id', org_id)
      .single();

    if (orgError || !org) {
      return NextResponse.json({ success: false, message: 'Organization not found' }, { status: 404 });
    }

    // Create the data request record
    const { data: reqData, error: reqError } = await supabaseAdmin
      .from('data_requests')
      .insert({
        requesting_org_id: org_id,
        target_system: 'WAH',
        philhealth_no: philhealth_no || null,
        patient_name: patient_name || null,
        request_reason: request_reason || 'Patient data transfer request',
        status: 'PENDING',
      })
      .select()
      .single();

    if (reqError) {
      return NextResponse.json({ success: false, message: reqError.message }, { status: 500 });
    }

    console.log(`[Portal Request] Created request ${reqData.id} from ${org.name} for ${philhealth_no || patient_name}`);

    // Forward request to iPaaS to fetch from WAH
    try {
      const ipaasRes = await fetch(`${IPAAS_URL}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: reqData.id,
          requesting_org: org.name,
          requesting_org_id: org.id,
          destination_format: org.data_format,
          philhealth_no,
          patient_name,
        }),
      });

      const ipaasData = await ipaasRes.json();

      if (ipaasData.success) {
        // We do NOT update to COMPLETED here. It remains PENDING until WAH approves.
        console.log(`[Portal Request] Request sent to iPaaS successfully. Waiting for WAH approval.`);
        return NextResponse.json({
          success: true,
          request_id: reqData.id,
          status: 'PENDING',
          message: 'Data request submitted to WAH. Waiting for manual approval.',
        });
      } else {
        await supabaseAdmin
          .from('data_requests')
          .update({
            status: 'FAILED',
            error_message: ipaasData.message || 'iPaaS request failed',
          })
          .eq('id', reqData.id);

        return NextResponse.json({
          success: false,
          request_id: reqData.id,
          status: 'FAILED',
          message: ipaasData.message || 'Failed to retrieve data from WAH',
        });
      }
    } catch (ipaasError) {
      console.warn('[Portal Request] iPaaS connection failed:', ipaasError);
      // Keep request as PENDING if iPaaS is unavailable
      return NextResponse.json({
        success: true,
        request_id: reqData.id,
        status: 'PENDING',
        message: 'Request created. iPaaS will process it when available.',
      });
    }
  } catch (error) {
    console.error('[Portal Request] Error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
