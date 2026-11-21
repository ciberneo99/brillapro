import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

/** Supabase client with the service_role key: it BYPASSES RLS. Reserved for the few server-side entry points
 *  that must not be callable with the public anon key (today: the public quote-request intake). Never import
 *  it from pages, components or actions that act on behalf of a signed-in user, and only call SECURITY DEFINER
 *  functions that validate their own input. */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(publicEnv().NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
