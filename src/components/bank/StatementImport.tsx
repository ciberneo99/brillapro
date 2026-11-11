"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, UploadCloud } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert, Button, Card, Select, cn } from "@/components/ui";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { importTransactions, previewStatement, type PreviewRow } from "@/modules/bank/actions";

export type CategoryChoice = { id: string; name: string; parent: string | null };

/** Category picker grouped by parent category. */
export function CategorySelect({ choices, ...props }: { choices: CategoryChoice[] } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const parents = choices.filter((c) => !c.parent);
  return (
    <Select {...props}>
      {props.children}
      {parents.map((p) => {
        const kids = choices.filter((c) => c.parent === p.name);
        return kids.length ? (
          <optgroup key={p.id} label={p.name}>{kids.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
        ) : <option key={p.id} value={p.id}>{p.name}</option>;
      })}
    </Select>
  );
}

export function StatementImport({ categories, currency, dateFormat }: { categories: CategoryChoice[]; currency: string; dateFormat: string }) {
  const t = useTranslations("bank");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<(PreviewRow & { on: boolean })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ added: number; skipped: number } | null>(null);
  const [pending, start] = useTransition();

  function choose(file: File | null) {
    setRows(null); setError(null); setDone(null);
    if (!file) return;
    const body = new FormData();
    body.set("file", file);
    start(async () => {
      const res = await previewStatement(body);
      if (res.ok) { setName(res.fileName); setRows(res.rows.map((r) => ({ ...r, on: !r.duplicate }))); }
      else setError(res.error);
      if (input.current) input.current.value = "";
    });
  }

  function save() {
    if (!rows) return;
    const chosen = rows.filter((r) => r.on);
    start(async () => {
      const res = await importTransactions({
        source: name,
        rows: chosen.map((r) => ({ date: r.date, description: r.description, amountCents: r.amountCents, balanceCents: r.balanceCents, categoryId: r.categoryId, n: r.n })),
      });
      if (res.ok) { setDone({ added: res.added, skipped: res.skipped }); setRows(null); router.refresh(); }
      else setError(res.error === "denied" ? "denied" : "failed");
    });
  }

  const set = (i: number, patch: Partial<PreviewRow & { on: boolean }>) => setRows((cur) => cur && cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const chosenCount = rows?.filter((r) => r.on).length ?? 0;

  return (
    <Card accent="blue" className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">{t("import.title")}</h2>
        <p className="text-sm text-muted">{t("import.help")}</p>
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); choose(e.dataTransfer.files?.[0] ?? null); }}
        className={cn("flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center", over ? "border-primary bg-surface-2" : "border-line")}
      >
        <UploadCloud className="h-8 w-8 text-primary" aria-hidden />
        <p className="text-sm text-muted">{t("import.drop")}</p>
        <input ref={input} id="bank-file" type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => choose(e.target.files?.[0] ?? null)} />
        <Button type="button" variant="secondary" disabled={pending} onClick={() => input.current?.click()}>
          <FileText className="h-4 w-4" aria-hidden />{pending && !rows ? t("import.reading") : t("import.choose")}
        </Button>
      </div>

      {error && <Alert>{t(`import.error.${error}`)}</Alert>}
      {done && <Alert tone="success">{t("import.done", { added: done.added, skipped: done.skipped })}</Alert>}

      {rows && (
        <div className="space-y-3">
          <p className="text-sm">{t("import.found", { count: rows.length, name })}</p>
          <div className="max-h-[28rem] overflow-auto rounded-lg border border-line">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th className="w-10 px-3 py-2"><input type="checkbox" aria-label={t("import.all")} checked={rows.every((r) => r.on)} onChange={(e) => setRows(rows.map((r) => ({ ...r, on: e.target.checked })))} /></th>
                  <th className="px-3 py-2">{t("cols.date")}</th><th className="px-3 py-2">{t("cols.description")}</th>
                  <th className="px-3 py-2">{t("cols.category")}</th><th className="px-3 py-2 text-right">{t("cols.amount")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r, i) => (
                  <tr key={i} className={cn(!r.on && "opacity-50")}>
                    <td className="px-3 py-2"><input type="checkbox" checked={r.on} aria-label={r.description} onChange={(e) => set(i, { on: e.target.checked })} /></td>
                    <td className="whitespace-nowrap px-3 py-2">{formatDateOnly(r.date, dateFormat)}</td>
                    <td className="px-3 py-2">{r.description}{r.duplicate && <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{t("import.already")}</span>}</td>
                    <td className="px-3 py-2">
                      <CategorySelect choices={categories} aria-label={t("cols.category")} className="h-9 min-w-44" value={r.categoryId ?? ""} onChange={(e) => set(i, { categoryId: e.target.value || null })}>
                        <option value="">{t("uncategorized")}</option>
                      </CategorySelect>
                    </td>
                    <td className={cn("whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums", r.amountCents > 0 ? "text-success" : "text-danger")}>{formatMoney(r.amountCents, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">{t("import.reviewHint")}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending || chosenCount === 0} onClick={save}>{pending ? t("import.saving") : t("import.save", { count: chosenCount })}</Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setRows(null)}>{t("import.cancel")}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
