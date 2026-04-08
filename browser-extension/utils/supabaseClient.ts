import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';

// These will be set from extension storage or environment
const STORAGE_KEY = 'meshfahem_auth';

let supabaseInstance: SupabaseClient | null = null;

export async function getSupabaseConfig(): Promise<{ url: string; anonKey: string } | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['supabase_url', 'supabase_anon_key'], (result) => {
      if (result.supabase_url && result.supabase_anon_key) {
        resolve({ url: result.supabase_url, anonKey: result.supabase_anon_key });
      } else {
        resolve(null);
      }
    });
  });
}

export async function getSupabase(): Promise<SupabaseClient | null> {
  if (supabaseInstance) return supabaseInstance;

  const config = await getSupabaseConfig();
  if (!config) return null;

  supabaseInstance = createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      storage: {
        getItem: (key: string) =>
          new Promise((resolve) => {
            chrome.storage.local.get(key, (result) => resolve(result[key] || null));
          }),
        setItem: (key: string, value: string) =>
          new Promise<void>((resolve) => {
            chrome.storage.local.set({ [key]: value }, resolve);
          }),
        removeItem: (key: string) =>
          new Promise<void>((resolve) => {
            chrome.storage.local.remove(key, resolve);
          }),
      },
    },
  });

  return supabaseInstance;
}

export async function getSession(): Promise<Session | null> {
  const supabase = await getSupabase();
  if (!supabase) return null;

  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signIn(email: string, password: string) {
  const supabase = await getSupabase();
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const supabase = await getSupabase();
  if (!supabase) return;

  await supabase.auth.signOut();
  supabaseInstance = null;
}

export async function saveConfig(url: string, anonKey: string) {
  return new Promise<void>((resolve) => {
    chrome.storage.local.set({ supabase_url: url, supabase_anon_key: anonKey }, () => {
      supabaseInstance = null; // Reset to force re-creation with new config
      resolve();
    });
  });
}
