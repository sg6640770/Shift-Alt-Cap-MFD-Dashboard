import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ubxemgbbahurgqukwevi.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVieGVtZ2JiYWh1cmdxdWt3ZXZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NjY1NTcsImV4cCI6MjEwNDQ0MjU1N30.I_mgMmI_zv85IbSc-vhLRbeJWTmTMrT_WnXQWbQujK8';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
