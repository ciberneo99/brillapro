"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/** One line of text; when it does not fit, a "See more" link opens the full text. */
export function ExpandableText({ text }: { text: string }) {
  const t = useTranslations("bank");
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const measure = () => { const el = ref.current; if (el && !open) setOverflows(el.scrollWidth > el.clientWidth + 1); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [text, open]);

  return (
    <div className={open ? "" : "flex items-baseline gap-2"}>
      <span ref={ref} className={open ? "break-words" : "block min-w-0 flex-1 truncate"} title={open ? undefined : text}>{text}</span>
      {(overflows || open) && (
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="shrink-0 text-xs font-medium text-primary hover:underline">
          {open ? t("less") : t("more")}
        </button>
      )}
    </div>
  );
}
