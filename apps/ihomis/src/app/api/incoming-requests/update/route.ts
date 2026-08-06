import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/incoming-requests/update — Update an incoming request's status
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, error_message } = body;

    if (!id || !status) {
      return NextResponse.json({ success: false, message: 'id and status are required' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { status };
    if (error_message !== undefined) updateData.error_message = error_message;

    const { data, error } = await supabaseAdmin
      .from('incoming_requests')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data, message: 'Request updated' });
  } catch (error) {
    console.error('[Portal Incoming Requests Update] Error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
