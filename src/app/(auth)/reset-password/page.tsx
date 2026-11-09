import { getTranslations } from "next-intl/server";
import { AuthForm } from "@/components/AuthForm";
import { updatePassword } from "../actions";

export default async function ResetPasswordPage() {
  const t = await getTranslations("auth");
  const tc = await getTranslations("common");
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">{t("resetTitle")}</h1>
      <AuthForm
        action={updatePassword}
        submitLabel={t("resetButton")}
        fields={[{ name: "password", type: "password", label: tc("password"), autoComplete: "new-password", hint: t("passwordHint") }]}
      />
    </div>
  );
}
