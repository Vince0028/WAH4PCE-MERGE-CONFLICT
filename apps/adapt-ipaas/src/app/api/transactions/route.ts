import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/transactions
 * Fetch transaction logs with optional filtering
 * Query params: ?status=SUCCESS&source=iHOMIS&limit=50&offset=0
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const source = searchParams.get('source');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabaseAdmin
      .from('adapt_transaction_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    if (source) {
      query = query.eq('source_system', source);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[iPaaS Transactions] Query error:', error);
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
      total: count,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[iPaaS Transactions] Unexpected error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
