"use client";

import { useState } from "react";

export type Priority = "low" | "normal" | "high";
const ORDER: Priority[] = ["low", "normal", "high"];

/** One button that cycles Low → Normal → High (red, from a light tint to solid) and sends the choice with the form. */
export function PriorityButton({ labels, title }: { labels: Record<Priority, string>; title: string }) {
  const [value, setValue] = useState<Priority>("normal");
  return (
    <>
      <input type="hidden" name="priority" value={value} />
      <button
        type="button" title={title} aria-label={`${title}: ${labels[value]}`}
        onClick={() => setValue(ORDER[(ORDER.indexOf(value) + 1) % ORDER.length])}
        className={`prio-${value} rounded-lg px-5 py-2 text-sm font-semibold transition-colors hover:opacity-85`}
      >
        {labels[value]}
      </button>
    </>
  );
}
