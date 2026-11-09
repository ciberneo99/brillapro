import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthForm } from "@/components/AuthForm";
import { signup } from "../actions";

export default async function SignupPage() {
  const t = await getTranslations("auth");
  const tc = await getTranslations("common");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">{t("signupTitle")}</h1>
        <p className="mt-1 text-sm text-muted">{t("signupSubtitle")}</p>
      </div>
      <AuthForm
        action={signup}
        submitLabel={t("signupButton")}
        doneMessage={`${t("checkEmailTitle")}. ${t("checkEmailBody")}`}
        fields={[
          { name: "full_name", type: "text", label: tc("fullName"), autoComplete: "name", smart: "name" },
          { name: "email", type: "email", label: tc("email"), autoComplete: "email" },
          { name: "password", type: "password", label: tc("password"), autoComplete: "new-password", hint: t("passwordHint") },
        ]}
      />
      <p className="text-center text-sm text-muted">
        {t("haveAccount")} <Link href="/login" className="text-primary hover:underline">{t("loginButton")}</Link>
      </p>
    </div>
  );
}
