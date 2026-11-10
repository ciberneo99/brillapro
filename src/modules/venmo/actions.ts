"use server";

import { can } from "@/lib/permissions";
import { getAppContext } from "@/lib/session";
import type { VenmoReport } from "./parse";
import { reportFromForm } from "./upload";

export type AnalyzeResult = { ok: true; report: VenmoReport } | { ok: false; error: "file" | "empty" | "format" | "tooBig" | "denied" };

/** Reads an uploaded Venmo CSV and returns the organized report. Nothing is stored. */
export async function analyzeVenmo(formData: FormData): Promise<AnalyzeResult> {
  const ctx = await getAppContext();
  if (!ctx || !can(ctx.role, "venmo:read")) return { ok: false, error: "denied" };
  return reportFromForm(formData, ctx.settings.timezone);
}
