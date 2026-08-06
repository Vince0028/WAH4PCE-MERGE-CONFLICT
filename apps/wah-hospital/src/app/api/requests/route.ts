import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'requests.json');

function readRequests() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, '[]', 'utf8');
      return [];
    }
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[WAH Requests] Error reading data:', error);
    return [];
  }
}

function writeRequests(requests: unknown[]) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(requests, null, 2), 'utf8');
  } catch (error) {
    console.error('[WAH Requests] Error writing data:', error);
  }
}

export async function GET() {
  const requests = readRequests();
  return NextResponse.json({ success: true, data: requests });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { request_id, requesting_org, requesting_org_id, destination_format, philhealth_no, patient_name, ipaas_transaction_id } = body;

    const newRequest = {
      id: request_id,
      requesting_org,
      requesting_org_id,
      destination_format,
      philhealth_no,
      patient_name,
      ipaas_transaction_id: ipaas_transaction_id || null,
      status: 'PENDING',
      created_at: new Date().toISOString()
    };

    const requests = readRequests();
    requests.push(newRequest);
    writeRequests(requests);

    return NextResponse.json({ success: true, message: 'Request logged successfully' });
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

    const requests = readRequests();
    const idx = requests.findIndex((r: any) => r.id === id);
    
    if (idx !== -1) {
      requests[idx].status = status;
      writeRequests(requests);
      return NextResponse.json({ success: true, message: 'Request updated' });
    } else {
      return NextResponse.json({ success: false, message: 'Request not found' }, { status: 404 });
    }
  } catch (error) {
    console.error('[WAH Requests] PUT Error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
