import { Star } from "lucide-react";

/** Read-only 1 to 5 star rating. */
export function Stars({ value, label }: { value: number | null; label: string }) {
  if (!value) return <span className="text-muted" aria-label={label}>—</span>;
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={n <= value ? "h-3.5 w-3.5 fill-[#f5b301] text-[#f5b301]" : "h-3.5 w-3.5 text-line"} aria-hidden />
      ))}
    </span>
  );
}
