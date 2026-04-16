window.supabaseClient = null;

if (window.APP_CONFIG.useSupabase) {
  window.supabaseClient = window.supabase.createClient(
    window.APP_CONFIG.supabaseUrl,
    window.APP_CONFIG.supabaseAnonKey
  );
}