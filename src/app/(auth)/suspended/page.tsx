import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui";

export const metadata = { title: "Account suspended" };

export default async function SuspendedPage() {
  const t = await getTranslations("admin.suspended");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("body")}</p>
      </div>
      <form action="/auth/signout" method="post"><Button type="submit" variant="secondary" className="w-full">{t("signOut")}</Button></form>
    </div>
  );
}
