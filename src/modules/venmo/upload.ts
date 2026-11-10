import "server-only";
import { buildVenmoReport, type ParseResult } from "./parse";

const MAX_BYTES = 2 * 1024 * 1024;

/** Reads the uploaded CSV from a form and builds the report. Nothing is saved. */
export async function reportFromForm(formData: FormData, timeZone: string): Promise<ParseResult | { ok: false; error: "file" }> {
  const f = formData.get("file");
  if (!(f instanceof File) || f.size === 0) return { ok: false, error: "file" };
  if (f.size > MAX_BYTES) return { ok: false, error: "tooBig" };
  if (!/\.csv$/i.test(f.name) && !/csv|text\/plain|excel/i.test(f.type)) return { ok: false, error: "file" };
  return buildVenmoReport(await f.text(), timeZone);
}
