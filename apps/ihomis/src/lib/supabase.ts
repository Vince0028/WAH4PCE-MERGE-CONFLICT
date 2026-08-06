import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('your-')) {
      throw new Error('Supabase credentials not configured. Update .env.local with real values.');
    }
    _supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _supabase;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase = new Proxy({} as SupabaseClient, {
  get: (_, prop) => {
    const client = getSupabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (client as any)[prop as string];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export const supabaseAdmin = supabase;

// ============================================
// Auth Helpers
// ============================================

export interface OrgProfile {
  id: string;
  auth_user_id: string;
  name: string;
  code: string;
  data_format: 'HL7V2' | 'FHIR_R4' | 'CDA_R2';
  contact_email: string | null;
  webhook_url: string | null;
  created_at: string;
}

/**
 * Sign up a new organization.
 * Creates a Supabase Auth user + an organizations row.
 */
export async function signUpOrg(
  email: string,
  password: string,
  orgName: string,
  orgCode: string,
  dataFormat: 'HL7V2' | 'FHIR_R4' | 'CDA_R2'
): Promise<{ success: boolean; error?: string; org?: OrgProfile }> {
  // 1. Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError) {
    return { success: false, error: authError.message };
  }

  if (!authData.user) {
    return { success: false, error: 'Failed to create user' };
  }

  // 2. Create organization profile
  const { data: orgData, error: orgError } = await supabase
    .from('organizations')
    .insert({
      auth_user_id: authData.user.id,
      name: orgName,
      code: orgCode,
      data_format: dataFormat,
      contact_email: email,
    })
    .select()
    .single();

  if (orgError) {
    return { success: false, error: orgError.message };
  }

  return { success: true, org: orgData };
}

/**
 * Sign in an existing organization.
 */
export async function signInOrg(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string; org?: OrgProfile }> {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) {
    return { success: false, error: authError.message };
  }

  if (!authData.user) {
    return { success: false, error: 'Login failed' };
  }

  // Fetch the org profile
  const { data: orgData, error: orgError } = await supabase
    .from('organizations')
    .select('*')
    .eq('auth_user_id', authData.user.id)
    .single();

  if (orgError || !orgData) {
    return { success: false, error: 'Organization profile not found. Please sign up first.' };
  }

  return { success: true, org: orgData };
}

/**
 * Sign out the current user.
 */
export async function signOutOrg(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * Get the current logged-in org profile.
 */
export async function getCurrentOrg(): Promise<OrgProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: orgData } = await supabase
    .from('organizations')
    .select('*')
    .eq('auth_user_id', user.id)
    .single();

  return orgData || null;
}
