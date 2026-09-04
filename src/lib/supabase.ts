import 'expo-sqlite/localStorage/install';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export function formatSupabaseError(error: any): string {
  if (!error) return 'An unknown error occurred.';
  const msg = typeof error === 'string' ? error : error.message || String(error);
  const lowerMsg = msg.toLowerCase();
  if (
    lowerMsg.includes('hostname could not be found') ||
    lowerMsg.includes('network request failed') ||
    lowerMsg.includes('fetch failed') ||
    lowerMsg.includes('unexpectedexception')
  ) {
    return 'Unable to connect to the server. Please check your internet connection and verify that your Supabase project in EXPO_PUBLIC_SUPABASE_URL is active and reachable.';
  }
  return msg;
}

