import { getTranslations } from "next-intl/server";
import { Alert, Button, Card, cn } from "@/components/ui";
import { matchLogoColor, removeLogo, resetBrandColor, saveBrand, uploadLogo } from "@/app/(app)/settings/actions";
import { DEFAULT_BRAND, LOGO_SIZES, textOn, type LogoSize } from "@/lib/brand-color";

const OK = ["saved", "removed", "brand", "brandreset"];

/** Company logo (shown on invoices and quotes) plus the color and size they are drawn with. PNG or JPG up to 1 MB. */
export async function LogoCard({
  url, canEdit, status, brandColor, logoSize,
}: { url: string | null; canEdit: boolean; status?: string; brandColor: string | null; logoSize: LogoSize }) {
  const t = await getTranslations("settings.logo");
  const color = brandColor ?? DEFAULT_BRAND;
  return (
    <Card className="space-y-3">
      <h2 className="text-base font-semibold">{t("title")}</h2>
      {status && <Alert tone={OK.includes(status) ? "success" : "danger"}>{t(`status.${status}`)}</Alert>}
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

      {canEdit && (
        <form action={saveBrand} className="space-y-4 border-t border-line pt-4">
          <div>
            <h3 className="text-sm font-semibold">{t("brandTitle")}</h3>
            <p className="text-xs text-muted">{t("brandHelp")}</p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              {t("colorLabel")}
              <input type="color" name="brand_color" defaultValue={color} className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-surface p-1" />
            </label>
            <div className="min-w-48 flex-1">
              <p className="mb-1 text-xs text-muted">{t("sample")}</p>
              <div className="rounded-md px-3 py-2 text-xs font-semibold" style={{ backgroundColor: color, color: textOn(color) }}>{t("sampleText")}</div>
            </div>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">{t("sizeTitle")}</legend>
            <div className="flex flex-wrap gap-2">
              {LOGO_SIZES.map((s) => (
                <label key={s} className="cursor-pointer">
                  <input type="radio" name="logo_size" value={s} defaultChecked={logoSize === s} className="peer sr-only" />
                  <span className={cn("block rounded-lg border border-line bg-surface px-4 py-2 text-sm hover:border-primary peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:font-semibold peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary")}>{t(`sizes.${s}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit">{t("saveBrand")}</Button>
            {url && <Button type="submit" variant="secondary" formAction={matchLogoColor}>{t("match")}</Button>}
            {brandColor && <Button type="submit" variant="ghost" formAction={resetBrandColor}>{t("useDefault")}</Button>}
          </div>
        </form>
      )}
    </Card>
  );
}
