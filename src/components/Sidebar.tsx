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
 *  filtered server-side by the user's permissions. The panel is solid brand color. */
export function Sidebar({ items, companyName, footer }: { items: Item[]; companyName: string; footer: React.ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const icons = Object.fromEntries(NAV.map((n) => [n.key, n.icon]));

  const content = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-fg">
      <div className="px-5 pb-4 pt-5">
        <p className="text-lg font-extrabold tracking-tight">{t("brand.name")}</p>
        <p className="mt-0.5 truncate text-xs opacity-75">{companyName}</p>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto px-3 pb-3">
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
                "bp-fx bp-fx-light bp-fx-nobar flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm",
                active ? "bg-white font-semibold text-primary shadow-sm" : "text-sidebar-fg/85 hover:bg-white/10 hover:text-sidebar-fg",
              )}
            >
              {Icon && (
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", active ? "bg-primary-soft" : "bg-white/10")}>
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
              )}
              <span className="truncate">{t(`nav.${item.key}`)}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/15 p-4">{footer}</div>
    </div>
  );

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between bg-sidebar px-4 py-3 text-sidebar-fg lg:hidden">
        <p className="font-extrabold tracking-tight">{t("brand.name")}</p>
        <button type="button" aria-label={t("common.openMenu")} onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-white/10">
          <Menu className="h-5 w-5" />
        </button>
      </div>
      <aside className="fixed inset-y-0 left-0 hidden w-64 lg:block">{content}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label={t("common.closeMenu")} className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%] shadow-card">
            <button type="button" aria-label={t("common.closeMenu")} onClick={() => setOpen(false)} className="absolute right-3 top-4 z-10 rounded-lg p-2 text-sidebar-fg hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
