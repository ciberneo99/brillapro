"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Confirmation in the middle of the screen, so it is seen wherever the page is scrolled. It fades after a moment.
 *
 * - URL mode (default): shows while `?<param>=...` is in the address (a server action redirects there) and removes that
 *   parameter when it fades, so a reload does not show it again and the next save shows it again.
 * - `param={null}` with `trigger`: shows every time `trigger` changes to something truthy (e.g. a form's action state).
 */
export function SavedToast({ children, param = "saved", trigger }: { children: ReactNode; param?: string | null; trigger?: unknown }) {
  const search = useSearchParams();
  const current: unknown = param ? search.get(param) : trigger;
  const [seen, setSeen] = useState<unknown>(undefined);
  const [shown, setShown] = useState(false);
  // New signal -> show it (adjusting state while rendering, so the first paint already has the toast).
  if (current !== seen) { setSeen(current); setShown(Boolean(current)); }

  useEffect(() => {
    if (!shown) return;
    const id = setTimeout(() => {
      setShown(false);
      if (!param) return;
      try {
        const u = new URL(window.location.href);
        if (u.searchParams.has(param)) { u.searchParams.delete(param); window.history.replaceState(null, "", u); }
      } catch { /* the toast still fades without cleaning the address */ }
    }, 2800);
    return () => clearTimeout(id);
  }, [shown, param]);

  if (!shown) return null;
  return (
    <div role="status" className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="bp-saved flex max-w-md items-center gap-3 rounded-2xl border border-success/40 bg-surface px-6 py-4 text-lg font-semibold text-success shadow-2xl ring-8 ring-success-soft">
        <svg viewBox="0 0 52 52" className="h-9 w-9 shrink-0" aria-hidden>
          <circle cx="26" cy="26" r="24" className="bp-saved-ring" fill="none" stroke="currentColor" strokeWidth="3" />
          <path d="M14 27l8 8 16-17" className="bp-saved-check" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{children}</span>
      </div>
    </div>
  );
}
