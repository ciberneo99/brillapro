import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui";

type Section = { title: string; body: string };

/** Renders a legal document from the "legal" messages. These are drafts until a lawyer reviews them. */
export async function LegalPage({ doc }: { doc: "privacy" | "terms" }) {
  const t = await getTranslations("legal");
  const sections = t.raw(`${doc}.sections`) as Section[];
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <Link href="/" className="text-sm text-muted hover:text-fg">← {t("back")}</Link>
      <h1 className="text-3xl font-semibold tracking-tight">{t(`${doc}.title`)}</h1>
      <Alert>{t("draft")}</Alert>
      <p className="text-sm text-muted">{t("updated")}</p>
      {sections.map((s) => (
        <section key={s.title} className="space-y-2">
          <h2 className="text-lg font-semibold">{s.title}</h2>
          <p className="text-sm leading-relaxed">{s.body}</p>
        </section>
      ))}
    </main>
  );
}
