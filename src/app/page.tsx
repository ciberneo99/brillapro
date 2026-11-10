import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  BarChart3, Boxes, Briefcase, Check, FileSpreadsheet, FileText, Receipt, ShieldCheck, Users, Wallet,
} from "lucide-react";
import { PreferenceControls } from "@/components/PreferenceControls";
import { Card, cn, type Accent } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { PLANS, TRIAL_DAYS } from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";
import { getTheme } from "@/lib/theme";

export const metadata: Metadata = {
  title: { absolute: "BrillaPro — CRM for cleaning companies" },
  description: "Customers, quotes, jobs, invoices and expenses in one simple system built for cleaning companies. In English and Spanish.",
};

const FEATURES: { key: string; icon: typeof Users; accent: Accent }[] = [
  { key: "customers", icon: Users, accent: "blue" },
  { key: "quotes", icon: FileText, accent: "violet" },
  { key: "jobs", icon: Briefcase, accent: "teal" },
  { key: "team", icon: ShieldCheck, accent: "amber" },
  { key: "invoices", icon: Receipt, accent: "green" },
  { key: "expenses", icon: Wallet, accent: "rose" },
  { key: "inventory", icon: Boxes, accent: "blue" },
  { key: "reports", icon: BarChart3, accent: "violet" },
  { key: "venmo", icon: FileSpreadsheet, accent: "teal" },
];

const btnPrimary = "inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-fg hover:bg-primary-hover";
const btnGhost = "inline-flex h-11 items-center justify-center rounded-lg border border-line bg-surface px-6 text-sm font-medium hover:bg-surface-2";

export default async function Home() {
  // Signed-in visitors go straight to the app; everyone else sees the landing page.
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/dashboard");

  const t = await getTranslations("landing");
  const tb = await getTranslations("brand");
  const theme = await getTheme();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="text-lg font-semibold tracking-tight text-primary">{tb("name")}</Link>
          <nav className="hidden items-center gap-6 text-sm text-muted md:flex" aria-label="Main">
            <a href="#features" className="hover:text-fg">{t("nav.features")}</a>
            <a href="#pricing" className="hover:text-fg">{t("nav.pricing")}</a>
            <a href="#faq" className="hover:text-fg">{t("nav.faq")}</a>
          </nav>
          <div className="flex items-center gap-2">
            <PreferenceControls compact theme={theme} />
            <Link href="/login" className="hidden h-9 items-center rounded-lg px-3 text-sm font-medium hover:bg-surface-2 sm:inline-flex">{t("login")}</Link>
            <Link href="/signup" className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-fg hover:bg-primary-hover">{t("cta")}</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="bg-primary-soft">
          <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:py-24">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{t("hero.title")}</h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">{t("hero.subtitle")}</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/signup" className={btnPrimary}>{t("cta")}</Link>
              <Link href="/login" className={btnGhost}>{t("login")}</Link>
            </div>
            <p className="mt-4 text-sm text-muted">{t("hero.note", { days: TRIAL_DAYS })}</p>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-16">
          <h2 className="text-center text-3xl font-semibold tracking-tight">{t("features.title")}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted">{t("features.subtitle")}</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ key, icon: Icon, accent }) => (
              <Card key={key} accent={accent} className="space-y-2">
                <Icon className="h-6 w-6 text-primary" aria-hidden />
                <h3 className="text-base font-semibold">{t(`features.items.${key}.title`)}</h3>
                <p className="text-sm text-muted">{t(`features.items.${key}.body`)}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="bg-surface-2">
          <div className="mx-auto max-w-5xl px-4 py-16">
            <h2 className="text-center text-3xl font-semibold tracking-tight">{t("steps.title")}</h2>
            <ol className="mt-10 grid gap-6 sm:grid-cols-3">
              {(["one", "two", "three"] as const).map((k, i) => (
                <li key={k} className="text-center">
                  <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-fg">{i + 1}</span>
                  <h3 className="mt-3 font-semibold">{t(`steps.${k}.title`)}</h3>
                  <p className="mt-1 text-sm text-muted">{t(`steps.${k}.body`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-16">
          <h2 className="text-center text-3xl font-semibold tracking-tight">{t("pricing.title")}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted">{t("pricing.subtitle")}</p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {PLANS.map((p) => (
              <div key={p.id} className={cn("flex flex-col rounded-xl border bg-surface p-6 shadow-card", p.highlight ? "border-primary ring-2 ring-primary" : "border-line")}>
                {p.highlight && <span className="mb-2 w-fit rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-fg">{t("pricing.popular")}</span>}
                <h3 className="text-lg font-semibold">{t(`pricing.plans.${p.id}.name`)}</h3>
                <p className="mt-1 text-sm text-muted">{t(`pricing.plans.${p.id}.tagline`)}</p>
                <p className="mt-4"><span className="text-4xl font-semibold">{formatMoney(p.monthlyCents, "USD").replace(".00", "")}</span><span className="text-muted"> {t("pricing.perMonth")}</span></p>
                <p className="mt-1 text-sm text-muted">{t("pricing.yearly", { price: formatMoney(p.yearlyCents, "USD").replace(".00", "") })}</p>
                <ul className="mt-5 flex-1 space-y-2 text-sm">
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />{t("pricing.users", { count: p.maxUsers })}</li>
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />{t("pricing.everything")}</li>
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />{t("pricing.bilingual")}</li>
                </ul>
                <Link href="/signup" className={cn("mt-6", p.highlight ? btnPrimary : btnGhost)}>{t("cta")}</Link>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-muted">{t("pricing.note", { days: TRIAL_DAYS })}</p>
        </section>

        <section id="faq" className="mx-auto max-w-3xl scroll-mt-16 px-4 pb-16">
          <h2 className="text-center text-3xl font-semibold tracking-tight">{t("faq.title")}</h2>
          <div className="mt-8 space-y-3">
            {(["trial", "spanish", "team", "payments", "data"] as const).map((k) => (
              <details key={k} className="group rounded-xl border border-line bg-surface p-4">
                <summary className="cursor-pointer list-none font-medium">{t(`faq.items.${k}.q`, { days: TRIAL_DAYS })}</summary>
                <p className="mt-2 text-sm text-muted">{t(`faq.items.${k}.a`, { days: TRIAL_DAYS })}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="bg-primary-soft">
          <div className="mx-auto max-w-3xl px-4 py-14 text-center">
            <h2 className="text-3xl font-semibold tracking-tight">{t("final.title")}</h2>
            <p className="mt-3 text-muted">{t("final.body", { days: TRIAL_DAYS })}</p>
            <Link href="/signup" className={cn("mt-6", btnPrimary)}>{t("cta")}</Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-muted sm:flex-row">
          <p>© {new Date().getFullYear()} {tb("name")}</p>
          <p>{t("footer")}</p>
        </div>
      </footer>
    </div>
  );
}
