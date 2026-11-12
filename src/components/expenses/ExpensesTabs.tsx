import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/components/ui";

/** Expenses | Bank statement: the two ways of looking at what the company spent. */
export async function ExpensesTabs({ active }: { active: "expenses" | "bank" }) {
  const t = await getTranslations("expensesBank");
  const tabs = [{ id: "expenses", href: "/expenses", label: t("tabExpenses") }, { id: "bank", href: "/expenses/bank", label: t("tabBank") }] as const;
  return (
    <nav className="flex gap-1 border-b border-line" aria-label={t("tabs")}>
      {tabs.map((x) => (
        <Link key={x.id} href={x.href} aria-current={active === x.id ? "page" : undefined}
          className={cn("-mb-px border-b-2 px-4 py-2 text-sm font-medium", active === x.id ? "border-primary text-primary" : "border-transparent text-muted hover:text-fg")}>{x.label}</Link>
      ))}
    </nav>
  );
}
