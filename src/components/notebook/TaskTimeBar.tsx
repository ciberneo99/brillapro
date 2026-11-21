"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { elapsedShare, timeLeft, urgency } from "@/lib/task-time";

const TONE = { ok: "bg-success", soon: "bg-warning", urgent: "bg-danger" } as const;
const TEXT = { ok: "text-muted", soon: "text-warning", urgent: "text-danger" } as const;

/**
 * Time bar of an open task: how much of the time until its deadline has passed, with the time left written next to it
 * (days, then hours once under a day, then minutes). It refreshes every minute. `now` is the server's clock, so the first
 * paint matches the server's HTML.
 */
export function TaskTimeBar({ created, due, now: serverNow }: { created: number; due: number; now: number }) {
  const t = useTranslations("tasks.time");
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const left = timeLeft(now, due);
  const level = urgency(now, due);
  const pct = Math.round(elapsedShare(now, created, due) * 100);

  return (
    <div className="mt-1 flex max-w-sm items-center gap-2">
      <div
        role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t("label")}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-line"
      >
        <div className={`h-full rounded-full transition-[width] ${TONE[level]}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`shrink-0 text-xs font-medium tabular-nums ${TEXT[level]}`}>{t(left.kind, { count: left.count })}</span>
    </div>
  );
}
