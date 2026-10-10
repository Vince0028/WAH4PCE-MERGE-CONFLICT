import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/ai-toggle
 * Returns the current AI enabled/disabled state from the settings table.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('adapt_settings')
    .select('value')
    .eq('key', 'ai_enabled')
    .single();

  if (error || !data) {
    // Default to AI enabled if no setting exists
    return NextResponse.json({ ai_enabled: true });
  }

  return NextResponse.json({ ai_enabled: data.value === 'true' });
}

/**
 * POST /api/ai-toggle
 * Toggles AI on or off.
 * Body: { ai_enabled: boolean }
 */
export async function POST(request: NextRequest) {
  const { ai_enabled } = await request.json();

  const { error } = await supabaseAdmin
    .from('adapt_settings')
    .upsert(
      { key: 'ai_enabled', value: String(ai_enabled) },
      { onConflict: 'key' }
    );

  if (error) {
    console.error('[AI Toggle] Failed to save setting:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  console.log(`[AI Toggle] AI transformation is now ${ai_enabled ? 'ENABLED' : 'DISABLED (Go Algorithm Mode)'}`);
  return NextResponse.json({ success: true, ai_enabled });
}
