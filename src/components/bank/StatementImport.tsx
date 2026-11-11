"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, UploadCloud } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert, Button, Card, Input, cn } from "@/components/ui";
import { CategoryPicker, type CategoryChoice } from "./CategoryPicker";
import { ExpandableText } from "./ExpandableText";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { importTransactions, previewStatement, type PreviewRow } from "@/modules/bank/actions";
import { parseMoney } from "@/modules/bank/parse";

export function StatementImport({ categories, currency, dateFormat }: { categories: CategoryChoice[]; currency: string; dateFormat: string }) {
  const t = useTranslations("bank");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<(PreviewRow & { on: boolean })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<{ start: string; end: string } | null>(null);
  const [prev, setPrev] = useState("");
  const [bankEnd, setBankEnd] = useState("");
  const [done, setDone] = useState<{ added: number; skipped: number } | null>(null);
  const [pending, start] = useTransition();

  function choose(file: File | null) {
    setRows(null); setError(null); setDone(null);
    if (!file) return;
    const body = new FormData();
    body.set("file", file);
    start(async () => {
      const res = await previewStatement(body);
      if (res.ok) {
        setName(res.fileName); setRows(res.rows.map((r) => ({ ...r, on: !r.duplicate })));
        const plain = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2));
        setPrev(plain(res.summary.beginningCents)); setBankEnd(plain(res.summary.endingCents));
        setPeriod(res.summary.periodStart && res.summary.periodEnd ? { start: res.summary.periodStart, end: res.summary.periodEnd } : null);
      }
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
        statement: period && (prevCents !== null || endCents !== null) ? { beginningCents: prevCents, endingCents: endCents, periodStart: period.start, periodEnd: period.end } : null,
        rows: chosen.map((r) => ({ date: r.date, description: r.description, amountCents: r.amountCents, balanceCents: r.balanceCents, categoryId: r.categoryId, n: r.n })),
      });
      if (res.ok) { setDone({ added: res.added, skipped: res.skipped }); setRows(null); router.refresh(); }
      else setError(res.error === "denied" ? "denied" : "failed");
    });
  }

  const set = (i: number, patch: Partial<PreviewRow & { on: boolean }>) => setRows((cur) => cur && cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const chosenCount = rows?.filter((r) => r.on).length ?? 0;
  const prevCents = prev.trim() === "" ? null : parseMoney(prev);
  const endCents = bankEnd.trim() === "" ? null : parseMoney(bankEnd);
  const net = (rows ?? []).filter((r) => r.on).reduce((a, r) => a + r.amountCents, 0);
  const expectedEnd = prevCents === null ? null : prevCents + net;
  const gap = expectedEnd !== null && endCents !== null ? endCents - expectedEnd : null;

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
          <div className="space-y-2 rounded-lg border border-line bg-surface-2 p-3">
            <p className="text-sm font-medium">{t("import.balances")}{period && <span className="ml-2 font-normal text-muted">{formatDateOnly(period.start, dateFormat)} – {formatDateOnly(period.end, dateFormat)}</span>}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">{t("import.previousBalance")}
                <Input inputMode="decimal" value={prev} onChange={(e) => setPrev(e.target.value)} className="mt-1" aria-label={t("import.previousBalance")} />
              </label>
              <label className="block text-sm">{t("import.endingBalance")}
                <Input inputMode="decimal" value={bankEnd} onChange={(e) => setBankEnd(e.target.value)} className="mt-1" aria-label={t("import.endingBalance")} />
              </label>
            </div>
            {gap === null ? <p className="text-xs text-muted">{t("import.balanceHint")}</p>
              : gap === 0 ? <p className="text-sm font-medium text-success">{t("import.matches")}</p>
              : <p className="text-sm font-medium text-danger">{t("import.differs", { amount: formatMoney(Math.abs(gap), currency) })}</p>}
          </div>
          <div className="max-h-[28rem] overflow-auto rounded-lg border border-line">
            <table className="w-full min-w-[40rem] table-fixed text-sm">
              <colgroup><col className="w-10" /><col className="w-28" /><col /><col className="w-56" /><col className="w-28" /></colgroup>
              <thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2"><input type="checkbox" aria-label={t("import.all")} checked={rows.every((r) => r.on)} onChange={(e) => setRows(rows.map((r) => ({ ...r, on: e.target.checked })))} /></th>
                  <th className="px-3 py-2">{t("cols.date")}</th><th className="px-3 py-2">{t("cols.description")}</th>
                  <th className="px-3 py-2">{t("cols.category")}</th><th className="px-3 py-2 text-right">{t("cols.amount")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r, i) => (
                  <tr key={i} className={cn(!r.on && "opacity-50")}>
                    <td className="px-3 py-2"><input type="checkbox" checked={r.on} aria-label={r.description} onChange={(e) => set(i, { on: e.target.checked })} /></td>
                    <td className="whitespace-nowrap px-3 py-2">{formatDateOnly(r.date, dateFormat)}</td>
                    <td className="px-3 py-2"><ExpandableText text={r.description} />{r.duplicate && <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{t("import.already")}</span>}</td>
                    <td className="px-3 py-2">
                      <CategoryPicker choices={categories} ariaLabel={t("cols.category")} placeholder={t("uncategorized")} className="h-9 min-w-48" value={r.categoryId ?? ""} onChange={(id) => set(i, { categoryId: id || null })} extras={[{ value: "", label: t("uncategorized") }]} />
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
