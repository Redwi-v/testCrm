import { createClient } from '@supabase/supabase-js';

declare global {
  interface Window {
    __APP_CONFIG__?: {
      supabaseUrl?: string;
      supabaseAnonKey?: string;
    };
  }
}

const url =
    window.__APP_CONFIG__?.supabaseUrl ||
    (import.meta.env.VITE_SUPABASE_URL as string | undefined),
  key =
    window.__APP_CONFIG__?.supabaseAnonKey ||
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);
export const client = url && key ? createClient(url, key) : null;
