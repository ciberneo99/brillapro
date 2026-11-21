import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";

/** SHA-256 of the visitor's IP (plus an optional salt), hex. Only the hash is ever stored. */
export function hashIp(ip: string, salt = ""): string {
  return createHash("sha256").update(`${salt}|${ip}`).digest("hex");
}

/** Best-effort client address behind the hosting proxy: first hop of x-forwarded-for, else x-real-ip. */
export async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim() || "unknown";
  return hashIp(ip, process.env.IP_HASH_SALT ?? "");
}
