import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isHexColor, isLogoSize, type LogoSize } from "@/lib/brand-color";

/** Short-lived link to the company logo for the screen (the bucket is private). */
export async function logoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("logos").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** Logo bytes for the PDF (react-pdf needs the data, not a link). react-pdf reads PNG and JPEG only. */
export async function logoForPdf(path: string | null): Promise<{ data: Buffer; format: "png" | "jpg" } | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("logos").download(path);
  if (!data) return null;
  return { data: Buffer.from(await data.arrayBuffer()), format: path.endsWith(".png") ? "png" : "jpg" };
}

/** The company's brand color (null = the app green) and how big its logo is drawn on invoices and quotes. */
export async function getBrand(tenantId: string): Promise<{ color: string | null; size: LogoSize }> {
  const supabase = await createClient();
  const { data } = await supabase.from("tenant_settings").select("brand_color,logo_size").eq("tenant_id", tenantId).single();
  const row = data as { brand_color?: unknown; logo_size?: unknown } | null;
  return { color: isHexColor(row?.brand_color) ? row.brand_color : null, size: isLogoSize(row?.logo_size) ? row.logo_size : "medium" };
}
