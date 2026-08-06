import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/orgs — Returns all registered organizations (public endpoint)
 * Used by WAH and other systems to see who's registered and what format they use.
 */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('organizations')
      .select('id, name, code, data_format, contact_email, created_at')
      .order('name', { ascending: true });

    if (error) {
      console.error('[Portal Orgs API] Error:', error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('[Portal Orgs API] Error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
