import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PreferenceControls } from "@/components/PreferenceControls";
import { RequestForm } from "@/components/customers/RequestForm";
import { createClient } from "@/lib/supabase/server";
import { getTheme } from "@/lib/theme";
import { submitQuoteRequest } from "./actions";

export const metadata = { title: "Request a quote", robots: { index: false } };

export default async function RequestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: company } = await supabase.rpc("public_company_name", { p_slug: slug.slice(0, 80) });
  if (!company) notFound();

  const t = await getTranslations("request");
  const theme = await getTheme();

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <p className="text-lg font-semibold tracking-tight text-primary">{company}</p>
        <PreferenceControls compact theme={theme} />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t("subtitle", { company })}</p>
      <RequestForm action={submitQuoteRequest.bind(null, slug)} company={company} />
    </main>
  );
}
