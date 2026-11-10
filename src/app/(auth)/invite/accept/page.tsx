import Link from "next/link";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { Alert, Button } from "@/components/ui";
import { getAppContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { acceptInvite } from "@/modules/team/actions";
import { INVITE_COOKIE } from "@/modules/team/constants";

export const metadata = { title: "Invitation" };

export default async function AcceptInvitePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const t = await getTranslations("team.accept");
  const token = (await cookies()).get(INVITE_COOKIE)?.value;
  if (!token) return <div className="space-y-4"><Alert>{t("invalid")}</Alert></div>;

  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("signInFirst")}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/signup" className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-fg hover:bg-primary-hover">{t("createAccount")}</Link>
          <Link href="/login" className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-line bg-surface px-6 text-sm font-medium hover:bg-surface-2">{t("haveAccount")}</Link>
        </div>
        <p className="text-xs text-muted">{t("sameEmail")}</p>
      </div>
    );
  }

  if (await getAppContext()) return <div className="space-y-4"><Alert>{t("other")}</Alert><Link href="/dashboard" className="text-sm text-primary hover:underline">{t("goBack")}</Link></div>;

  const { data } = await supabase.rpc("invitation_preview", { p_token: token });
  const inv = Array.isArray(data) ? data[0] : null;
  if (!inv) return <div className="space-y-4"><Alert>{t("mismatch", { email: u.user.email ?? "" })}</Alert></div>;
  const tr = await getTranslations("team.roles");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("body", { company: inv.company, role: tr(inv.role) })}</p>
      </div>
      {sp.error && <Alert>{t(sp.error === "seats" ? "seats" : sp.error === "other" ? "other" : "invalid")}</Alert>}
      <form action={acceptInvite}><Button type="submit" className="w-full">{t("accept")}</Button></form>
    </div>
  );
}
