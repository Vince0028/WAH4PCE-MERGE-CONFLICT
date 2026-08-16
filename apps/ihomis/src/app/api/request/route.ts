import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const IPAAS_URL = process.env.NEXT_PUBLIC_IPAAS_API_URL || 'http://localhost:3000/api';

/**
 * POST /api/request — Submit a data request to WAH via iPaaS
 * iHOMIS requests patient data from WAH. Hardcoded as iHOMIS identity.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { philhealth_no, patient_name, request_reason } = body;

    if (!philhealth_no && !patient_name) {
      return NextResponse.json({ success: false, message: 'PhilHealth number or patient name is required' }, { status: 400 });
    }

    console.log(`[iHOMIS Request] Requesting data from WAH for ${philhealth_no || patient_name}...`);

    // Forward request to iPaaS to fetch from WAH
    try {
      const ipaasRes = await fetch(`${IPAAS_URL}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesting_org: 'iHOMIS',
          requesting_org_id: 'IHOMIS-001',
          destination_format: 'HL7V2',
          philhealth_no,
          patient_name,
          request_reason: request_reason || 'Patient data transfer request',
        }),
      });

      const ipaasData = await ipaasRes.json();

      if (ipaasData.success) {
        console.log(`[iHOMIS Request] Request sent to iPaaS successfully. Waiting for WAH approval.`);
        return NextResponse.json({
          success: true,
          status: 'PENDING',
          message: 'Data request submitted to WAH. Waiting for manual approval.',
        });
      } else {
        return NextResponse.json({
          success: false,
          status: 'FAILED',
          message: ipaasData.message || 'Failed to send request to WAH',
        });
      }
    } catch (ipaasError) {
      console.warn('[iHOMIS Request] iPaaS connection failed:', ipaasError);
      return NextResponse.json({
        success: false,
        status: 'FAILED',
        message: 'Could not connect to iPaaS. Is the server running?',
      }, { status: 503 });
    }
  } catch (error) {
    console.error('[iHOMIS Request] Error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
