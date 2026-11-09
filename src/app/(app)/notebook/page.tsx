import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";

export const metadata = { title: "My Notebook" };

export default async function NotebookPage() {
  const ctx = await requireContext();
  if (!can(ctx.role, "notebook:read")) redirect("/dashboard");
  const t = await getTranslations("notebook");
  const later = [t("timeTracking"), t("notes"), t("tasks")];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("intro")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {can(ctx.role, "checklists:read") && (
          <Link href="/notebook/checklists" className="block">
            <Card accent="teal" className="h-full transition-shadow hover:shadow-md">
              <h2 className="font-semibold">{t("checklist.title")}</h2>
              <p className="mt-1 text-sm text-muted">{t("checklist.body")}</p>
            </Card>
          </Link>
        )}
        {later.map((name) => (
          <Card key={name} className="opacity-70">
            <h2 className="font-semibold">{name}</h2>
            <p className="mt-1 text-sm text-muted">{t("availableIn", { phase: 4 })}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
