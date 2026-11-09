"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/components/ui";
import { NAV } from "@/lib/navigation";

type Item = { key: string; href: string };

/** Fixed left sidebar on desktop; slide-over drawer on mobile. The list is already
 *  filtered server-side by the user's permissions. */
export function Sidebar({ items, companyName, footer }: { items: Item[]; companyName: string; footer: React.ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const icons = Object.fromEntries(NAV.map((n) => [n.key, n.icon]));

  const content = (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <p className="text-lg font-semibold tracking-tight text-primary">{t("brand.name")}</p>
        <p className="mt-0.5 truncate text-xs text-muted">{companyName}</p>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {items.map((item) => {
          const Icon = icons[item.key];
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.key}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active ? "bg-primary-soft font-medium text-primary" : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />}
              <span className="truncate">{t(`nav.${item.key}`)}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-line p-4">{footer}</div>
    </div>
  );

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
        <p className="font-semibold text-primary">{t("brand.name")}</p>
        <button type="button" aria-label={t("common.openMenu")} onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-surface-2">
          <Menu className="h-5 w-5" />
        </button>
      </div>
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-line bg-surface lg:block">{content}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label={t("common.closeMenu")} className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-surface shadow-card">
            <button type="button" aria-label={t("common.closeMenu")} onClick={() => setOpen(false)} className="absolute right-3 top-4 rounded-lg p-2 hover:bg-surface-2">
              <X className="h-5 w-5" />
            </button>
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
