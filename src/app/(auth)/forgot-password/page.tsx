import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthForm } from "@/components/AuthForm";
import { requestPasswordReset } from "../actions";

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth");
  const tc = await getTranslations("common");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">{t("forgotTitle")}</h1>
        <p className="mt-1 text-sm text-muted">{t("forgotSubtitle")}</p>
      </div>
      <AuthForm
        action={requestPasswordReset}
        submitLabel={t("forgotButton")}
        doneMessage={t("forgotSent")}
        fields={[{ name: "email", type: "email", label: tc("email"), autoComplete: "email" }]}
      />
      <p className="text-center text-sm">
        <Link href="/login" className="text-primary hover:underline">{t("backToLogin")}</Link>
      </p>
    </div>
  );
}
