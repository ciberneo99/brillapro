import { NextResponse, type NextRequest } from "next/server";
import { INVITE_COOKIE } from "@/modules/team/constants";

/** The emailed link lands here: keep the token in a short-lived cookie so it isn't carried in later URLs. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = NextResponse.redirect(new URL("/invite/accept", request.nextUrl.origin));
  if (/^[0-9a-f]{64}$/.test(token)) {
    res.cookies.set(INVITE_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24, secure: request.nextUrl.protocol === "https:" });
  }
  return res;
}
