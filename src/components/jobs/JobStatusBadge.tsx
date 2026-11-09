import { getTranslations } from "next-intl/server";
import { cn } from "@/components/ui";

const TONE: Record<string, string> = {
  scheduled: "bg-primary-soft text-primary",
  in_progress: "bg-warning-soft text-warning",
  completed: "bg-success-soft text-success",
  cancelled: "bg-surface-2 text-muted line-through",
};

export async function JobStatusBadge({ status }: { status: string }) {
  const t = await getTranslations("jobs.status");
  return <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", TONE[status] ?? TONE.scheduled)}>{t(status)}</span>;
}
