import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 303 so the browser follows with GET. Theme/language cookies are kept on purpose.
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
