import { getTranslations } from "next-intl/server";
import { cn } from "@/components/ui";

const TONE: Record<string, string> = {
  draft: "bg-surface-2 text-muted",
  sent: "bg-primary-soft text-primary",
  partial: "bg-warning-soft text-warning",
  paid: "bg-success-soft text-success",
  overdue: "bg-danger-soft text-danger",
  void: "bg-surface-2 text-muted line-through",
};

export async function InvoiceStatusBadge({ status }: { status: string }) {
  const t = await getTranslations("invoices.status");
  return <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", TONE[status] ?? TONE.draft)}>{t(status)}</span>;
}
