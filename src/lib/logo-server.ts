import "server-only";
import { createClient } from "@/lib/supabase/server";

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
