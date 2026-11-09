import { getTranslations } from "next-intl/server";
import { cn } from "@/components/ui";

const TONE: Record<string, string> = {
  draft: "bg-surface-2 text-muted",
  sent: "bg-primary-soft text-primary",
  accepted: "bg-success-soft text-success",
  declined: "bg-danger-soft text-danger",
  expired: "bg-warning-soft text-warning",
};

export async function QuoteStatusBadge({ status }: { status: string }) {
  const t = await getTranslations("quotes.status");
  return <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", TONE[status] ?? TONE.draft)}>{t(status)}</span>;
}
