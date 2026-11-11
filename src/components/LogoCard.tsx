import { getTranslations } from "next-intl/server";
import { Alert, Button, Card } from "@/components/ui";
import { removeLogo, uploadLogo } from "@/app/(app)/settings/actions";

/** Company logo: shown on invoices. PNG or JPG up to 1 MB. */
export async function LogoCard({ url, canEdit, status }: { url: string | null; canEdit: boolean; status?: string }) {
  const t = await getTranslations("settings.logo");
  return (
    <Card className="space-y-3">
      <h2 className="text-base font-semibold">{t("title")}</h2>
      {status && <Alert tone={status === "saved" || status === "removed" ? "success" : "danger"}>{t(`status.${status}`)}</Alert>}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-20 w-36 items-center justify-center overflow-hidden rounded-lg border border-dashed border-line bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
          {url ? <img src={url} alt={t("alt")} className="max-h-full max-w-full object-contain" /> : <span className="px-2 text-center text-xs text-muted">{t("none")}</span>}
        </div>
        {canEdit && (
          <div className="space-y-2">
            <form action={uploadLogo} className="flex flex-wrap items-center gap-2">
              <input type="file" name="logo" accept="image/png,image/jpeg" required aria-label={t("choose")} className="max-w-60 text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-2 file:text-sm" />
              <Button type="submit" variant="secondary">{t("upload")}</Button>
            </form>
            {url && <form action={removeLogo}><Button type="submit" variant="ghost" className="text-danger">{t("remove")}</Button></form>}
            <p className="text-xs text-muted">{t("help")}</p>
          </div>
        )}
      </div>
    </Card>
  );
}
