import { getTranslations } from "next-intl/server";
import { PreferenceControls } from "@/components/PreferenceControls";
import { getTheme } from "@/lib/theme";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("brand");
  const theme = await getTheme();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <PreferenceControls compact theme={theme} />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-2xl font-semibold tracking-tight text-primary">{t("name")}</p>
          <p className="mt-1 text-sm text-muted">{t("tagline")}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-6 shadow-card">{children}</div>
      </div>
    </main>
  );
}
