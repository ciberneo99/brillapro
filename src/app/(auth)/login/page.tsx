import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthForm } from "@/components/AuthForm";
import { Alert } from "@/components/ui";
import { login } from "../actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const t = await getTranslations("auth");
  const tc = await getTranslations("common");
  const { error } = await searchParams;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">{t("loginTitle")}</h1>
        <p className="mt-1 text-sm text-muted">{t("loginSubtitle")}</p>
      </div>
      {error === "callback" && <Alert>{t("callbackError")}</Alert>}
      <AuthForm
        action={login}
        submitLabel={t("loginButton")}
        fields={[
          { name: "email", type: "email", label: tc("email"), autoComplete: "email" },
          { name: "password", type: "password", label: tc("password"), autoComplete: "current-password" },
        ]}
      />
      <div className="space-y-2 text-center text-sm">
        <Link href="/forgot-password" className="text-primary hover:underline">{t("forgot")}</Link>
        <p className="text-muted">
          {t("noAccount")} <Link href="/signup" className="text-primary hover:underline">{t("createAccount")}</Link>
        </p>
      </div>
    </div>
  );
}
