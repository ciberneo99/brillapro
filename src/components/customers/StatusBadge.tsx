import { getTranslations } from "next-intl/server";
import { cn } from "@/components/ui";
import type { CustomerStatus } from "@/modules/customers/schema";

const TONE: Record<CustomerStatus, string> = {
  prospect: "bg-warning-soft text-warning",
  active: "bg-success-soft text-success",
  inactive: "bg-surface-2 text-muted",
  archived: "bg-surface-2 text-muted line-through",
};

export async function StatusBadge({ status }: { status: CustomerStatus }) {
  const t = await getTranslations("customers.status");
  return <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", TONE[status])}>{t(status)}</span>;
}
