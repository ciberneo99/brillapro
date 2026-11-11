import { getLocale, getTranslations } from "next-intl/server";
import { Alert, Button, Card, Input, cn } from "@/components/ui";
import { SelectMenu } from "@/components/ui/SelectMenu";
import { addBankCategory, toggleBankCategory, updateBankCategory } from "@/modules/bank/actions";
import { categoryLabels, listBankCategories, type BankCategory } from "@/modules/bank/queries";

const TONES = ["blue", "green", "violet", "amber", "rose", "teal"] as const;

/** The company's categories (main and sub) with their keywords: the one list used by Bank Reports and Expenses. */
export async function CategoriesManager({ sp, canWrite, tenantId, back, compact = false }: { sp: { error?: string; saved?: string }; canWrite: boolean; tenantId: string; back: string; compact?: boolean }) {
  const tb = await getTranslations("bank");
  const cats = await listBankCategories(tenantId, await getLocale());
  const roots = cats.filter((c) => !c.parent_id);
  const labels = categoryLabels(cats);
  const row = (c: BankCategory, child = false) => (
    <li key={c.id} className={cn("flex flex-wrap items-center gap-2 py-2", child && "pl-5", !c.is_active && "opacity-60")}>
      {canWrite ? (
        <form action={updateBankCategory.bind(null, c.id)} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <input type="hidden" name="back" value={back} />
          <Input name="name" defaultValue={c.name} maxLength={80} aria-label={tb("cats.name")} className="h-9 w-56" />
          <Input name="keywords" defaultValue={c.keywords} maxLength={500} aria-label={tb("cats.keywords")} placeholder={tb("cats.keywordsPlaceholder")} className="h-9 min-w-48 flex-1" />
          <Button type="submit" variant="secondary" className="h-9">{tb("save")}</Button>
        </form>
      ) : <span className="flex-1">{c.name} <span className="text-xs text-muted">{c.keywords}</span></span>}
      {canWrite && (
        <form action={toggleBankCategory.bind(null, c.id, !c.is_active)}>
          <input type="hidden" name="back" value={back} />
          <Button type="submit" variant="ghost" className="h-9">{c.is_active ? tb("cats.hide") : tb("cats.show")}</Button>
        </form>
      )}
    </li>
  );
  const line = (cat: BankCategory, child = false) => (
    <li key={cat.id} className={cn("flex items-start gap-3 py-0.5 text-sm", child && "pl-5", !cat.is_active && "text-muted line-through")}>
      {canWrite ? (
        <details className="min-w-0 flex-1 [&[open]>summary_.edit-hint]:hidden">
          <summary className={cn("block cursor-pointer list-none truncate", !child && "font-medium")}>
            {cat.name}
            {cat.keywords && <span className="ml-2 text-xs font-normal text-muted no-underline">{cat.keywords}</span>}
            <span className="edit-hint ml-2 text-xs font-normal text-primary no-underline">{tb("cats.edit")}</span>
          </summary>
          <form action={updateBankCategory.bind(null, cat.id)} className="my-1.5 flex flex-wrap items-center gap-2">
            <input type="hidden" name="back" value={back} />
            <Input name="name" defaultValue={cat.name} maxLength={80} aria-label={tb("cats.name")} className="h-8 w-48" />
            <Input name="keywords" defaultValue={cat.keywords} maxLength={500} aria-label={tb("cats.keywords")} placeholder={tb("cats.keywordsPlaceholder")} className="h-8 min-w-40 flex-1" />
            <Button type="submit" variant="secondary" className="h-8 px-3">{tb("save")}</Button>
          </form>
        </details>
      ) : (
        <span className={cn("min-w-0 flex-1", !child && "font-medium")}>{cat.name}{cat.keywords && <span className="ml-2 text-xs font-normal text-muted">{cat.keywords}</span>}</span>
      )}
      {canWrite && (
        <form action={toggleBankCategory.bind(null, cat.id, !cat.is_active)}>
          <input type="hidden" name="back" value={back} />
          <button type="submit" className="text-xs text-muted no-underline hover:text-fg">{cat.is_active ? tb("cats.hide") : tb("cats.show")}</button>
        </form>
      )}
    </li>
  );

  if (compact) {
    return (
      <div className="space-y-4">
        {sp.error && <Alert>{tb(sp.error === "duplicate" ? "errors.duplicate" : "errors.invalid")}</Alert>}
        {sp.saved && <Alert tone="success">{tb("saved")}</Alert>}
        {canWrite && (
          <form action={addBankCategory} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="back" value={back} />
            <div className="w-48"><Input name="name" required maxLength={80} placeholder={tb("cats.name")} aria-label={tb("cats.name")} className="h-9" /></div>
            <div className="w-56"><SelectMenu name="parent_id" defaultValue="" ariaLabel={tb("cats.parent")} className="h-9" options={[{ value: "", label: tb("cats.topLevel") }, ...roots.filter((x) => x.is_active).map((x) => ({ value: x.id, label: tb("cats.under", { name: x.name }) }))]} /></div>
            <div className="min-w-48 flex-1"><Input name="keywords" maxLength={500} placeholder={tb("cats.keywordsPlaceholder")} aria-label={tb("cats.keywords")} className="h-9" /></div>
            <Button type="submit" className="h-9">{tb("cats.addButton")}</Button>
          </form>
        )}
        <div className="gap-x-10 sm:columns-2 xl:columns-3">
          {roots.map((p) => (
            <ul key={p.id} className="mb-3 break-inside-avoid">
              {line(p)}
              {cats.filter((x) => x.parent_id === p.id).map((x) => line(x, true))}
            </ul>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sp.error && <Alert>{tb(sp.error === "duplicate" ? "errors.duplicate" : "errors.invalid")}</Alert>}
      {sp.saved && <Alert tone="success">{tb("saved")}</Alert>}
      <p className="text-sm text-muted">{tb("cats.help")}</p>
      {canWrite && (
        <Card accent="green">
          <h2 className="mb-3 text-base font-semibold">{tb("cats.add")}</h2>
          <form action={addBankCategory} className="grid gap-2 md:grid-cols-[14rem_14rem_1fr_auto]">
            <input type="hidden" name="back" value={back} />
            <Input name="name" required maxLength={80} placeholder={tb("cats.name")} aria-label={tb("cats.name")} />
            <SelectMenu name="parent_id" defaultValue="" ariaLabel={tb("cats.parent")} options={[{ value: "", label: tb("cats.topLevel") }, ...roots.filter((c) => c.is_active).map((c) => ({ value: c.id, label: tb("cats.under", { name: c.name }) }))]} />
            <Input name="keywords" maxLength={500} placeholder={tb("cats.keywordsPlaceholder")} aria-label={tb("cats.keywords")} />
            <Button type="submit">{tb("cats.addButton")}</Button>
          </form>
          <p className="mt-2 text-xs text-muted">{tb("cats.keywordsHelp")}</p>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {roots.map((p) => (
          <Card key={p.id}>
            <div className="mb-1 flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: `var(--c-${TONES[(labels.get(p.id)?.tone ?? 0) % TONES.length]})` }} aria-hidden />
              <h2 className="text-base font-semibold">{p.name}</h2>
            </div>
            <ul className="divide-y divide-line">
              {row(p)}
              {cats.filter((c) => c.parent_id === p.id).map((c) => row(c, true))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
