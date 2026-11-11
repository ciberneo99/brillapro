"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/components/ui";

export type ProfileTab = { key: string; label: string; count: number; content: ReactNode };

/** Jobs / Invoices / Quotes switcher for the customer page. Panels are rendered on the server and passed in. */
export function ProfileTabs({ tabs, initial }: { tabs: ProfileTab[]; initial?: string }) {
  const [active, setActive] = useState(tabs.find((t) => t.key === initial)?.key ?? tabs[0]?.key);
  return (
    <div>
      <div role="tablist" className="flex gap-1 rounded-xl bg-surface-2 p-1">
        {tabs.map((t) => (
          <button
            key={t.key} type="button" role="tab" id={`tab-${t.key}`} aria-selected={active === t.key} aria-controls={`panel-${t.key}`}
            onClick={() => setActive(t.key)}
            className={cn("flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors", active === t.key ? "bg-primary text-white shadow-sm" : "text-muted hover:text-fg")}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" id={`panel-${t.key}`} aria-labelledby={`tab-${t.key}`} hidden={active !== t.key} className="pt-3">
          {t.content}
        </div>
      ))}
    </div>
  );
}
