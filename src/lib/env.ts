import { z } from "zod";

const schema = z.object({
  // No trailing slash: links are built as `${APP_URL}/path`, and a "//path" breaks the router and emailed links.
  NEXT_PUBLIC_APP_URL: z.url().transform((u) => u.replace(/\/+$/, "")),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
});

/** Public (browser-safe) env only. Server-only secrets are read where used and never exported here. */
export function publicEnv() {
  return schema.parse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
