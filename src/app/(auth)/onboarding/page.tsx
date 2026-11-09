import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthForm } from "@/components/AuthForm";
import { getAppContext } from "@/lib/session";
import { createWorkspace } from "../actions";

export default async function OnboardingPage() {
  if (await getAppContext()) redirect("/dashboard"); // already has a company
  const t = await getTranslations("onboarding");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </div>
      <AuthForm
        action={createWorkspace}
        errorNamespace="onboarding"
        submitLabel={t("button")}
        fields={[{ name: "company", type: "text", label: t("companyName"), placeholder: t("companyPlaceholder"), autoComplete: "organization" }]}
      />
    </div>
  );
}
