import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  if (!url || !key || !url.startsWith("http")) {
    // Return a dummy during SSR/build with no real Supabase configured
    throw new Error("Supabase not configured");
  }
  client = createBrowserClient(url, key);
  return client;
}
