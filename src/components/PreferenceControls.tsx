"use client";

import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { savePreferences } from "@/lib/preferences";
import { cn } from "@/components/ui";
import { SelectMenu } from "@/components/ui/SelectMenu";
import { LOCALES, THEMES, type Theme } from "@/i18n/config";

/** Language + theme switchers. Theme is applied to <html> immediately, then persisted.
 *  `theme` is the server-known value (cookie), so server and client render identically. */
export function PreferenceControls({ theme: initialTheme, compact = false }: { theme: Theme; compact?: boolean }) {
  const t = useTranslations("common");
  const locale = useLocale();
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [pending, start] = useTransition();

  // Reflect the choice on <html> right away (the server re-renders the same value after saving).
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    start(() => void savePreferences({ theme: next }));
  };
  const setLocale = (next: string) => start(() => void savePreferences({ locale: next }));

  const seg = (active: boolean) =>
    cn(
      "px-3 py-1.5 text-sm transition-colors",
      active ? "bg-primary text-primary-fg" : "bg-surface text-muted hover:bg-surface-2 hover:text-fg",
    );
  const group = "inline-flex overflow-hidden rounded-lg border border-line";

  return (
    <div className={cn("flex flex-wrap items-center gap-3", pending && "opacity-80")}>
      <div role="group" aria-label={t("language")} className={group}>
        {LOCALES.map((l) => (
          <button key={l} type="button" aria-pressed={locale === l} onClick={() => setLocale(l)} className={seg(locale === l)}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      {compact ? (
        <div className="w-32">
          <SelectMenu
            ariaLabel={t("theme")} value={theme} onChange={(v) => setTheme(v as Theme)} className="h-9"
            options={THEMES.map((th) => ({ value: th, label: t(th) }))}
          />
        </div>
      ) : (
        <div role="group" aria-label={t("theme")} className={group}>
          {THEMES.map((th) => (
            <button key={th} type="button" aria-pressed={theme === th} onClick={() => setTheme(th)} className={seg(theme === th)}>
              {t(th)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
