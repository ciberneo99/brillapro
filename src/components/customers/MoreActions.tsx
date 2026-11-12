"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Download, FileSpreadsheet, MoreHorizontal, Upload, UploadCloud, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert, Button, cn } from "@/components/ui";
import { importCustomers, type ImportResult } from "@/modules/customers/actions";
import { CSV_LABELS, type CsvKey } from "@/modules/customers/csv";

const SHOWN_SKIPS = 8;

/** "More Actions" menu of the customers page: import from CSV (with a how-to window) and export as CSV. */
export function MoreActions({ canImport }: { canImport: boolean }) {
  const t = useTranslations("customers");
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [menu]);

  const item = "bp-fx-item flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-primary-soft hover:text-primary";
  return (
    <div ref={wrap} className="relative">
      <button
        type="button" onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu}
        className="flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden /> {t("more.label")} <ChevronDown className="h-4 w-4" aria-hidden />
      </button>
      {menu && (
        <div role="menu" className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-line bg-surface p-1.5 text-sm shadow-card">
          {canImport && (
            <button type="button" role="menuitem" onClick={() => { setMenu(false); setDialog(true); }} className={item}>
              <Upload className="h-4 w-4 text-muted" aria-hidden /> {t("more.import")}
            </button>
          )}
          <a role="menuitem" href="/customers/export" download onClick={() => setMenu(false)} className={item}>
            <Download className="h-4 w-4 text-muted" aria-hidden /> {t("more.export")}
          </a>
        </div>
      )}
      {dialog && <ImportDialog onClose={() => setDialog(false)} />}
    </div>
  );
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("customers.import");
  const ref = useRef<HTMLDialogElement | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  function choose(f: File | null) { setFile(f); setResult(null); setFailed(false); }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    const body = new FormData();
    body.set("file", file);
    setResult(null); setFailed(false);
    start(async () => {
      try { setResult(await importCustomers(body)); } catch { setFailed(true); }
    });
  }

  const done = result?.ok === true;
  const steps = ["1", "2", "3"] as const;
  const rules = ["name", "headers", "propertyType", "frequency", "status", "format", "duplicates"] as const;

  return createPortal(
    <dialog
      ref={(el) => { ref.current = el; if (el && !el.open) el.showModal(); }}
      onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }} aria-labelledby="import-title"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-fg shadow-xl backdrop:bg-black/40"
    >
      <form onSubmit={submit} className="space-y-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="import-title" className="text-2xl font-semibold tracking-tight">{t("title")}</h2>
            <p className="mt-1 text-sm text-muted">{t("intro")}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label={t("close")}><X className="h-5 w-5" aria-hidden /></button>
        </div>

        {!done && (
          <>
            <ol className="space-y-2 text-sm">
              {steps.map((s) => (
                <li key={s} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">{s}</span>
                  <span className="pt-0.5">{t(`steps.${s}`)}</span>
                </li>
              ))}
            </ol>

            <a href="/customers/template" download className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2">
              <Download className="h-4 w-4" aria-hidden /> {t("template")}
            </a>

            <details className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm">
              <summary className="cursor-pointer font-medium">{t("rulesTitle")}</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                {rules.map((r) => <li key={r}>{t(`rules.${r}`)}</li>)}
              </ul>
            </details>

            <div>
              <input ref={input} id="customers-csv" type="file" accept=".csv,text/csv" onChange={(e) => choose(e.target.files?.[0] ?? null)} className="sr-only" />
              <label
                htmlFor="customers-csv"
                onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) choose(f); }}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors focus-within:ring-2 focus-within:ring-primary",
                  over ? "border-primary bg-primary-soft" : "border-line bg-surface-2 hover:border-primary hover:bg-primary-soft",
                )}
              >
                {file ? <FileSpreadsheet className="h-8 w-8 text-primary" aria-hidden /> : <UploadCloud className="h-8 w-8 text-primary" aria-hidden />}
                <span className="text-sm font-semibold">{file ? file.name : t("choose")}</span>
                <span className="text-xs text-muted">{file ? t("change") : t("dropHint")}</span>
              </label>
            </div>
          </>
        )}

        {failed && <Alert>{t("errors.failed")}</Alert>}
        {result && !result.ok && <Alert>{t(`errors.${result.error}`)}</Alert>}
        {result?.ok && <ImportSummary result={result} />}

        <div className="flex justify-end gap-3 pt-1">
          {done ? (
            <Button type="button" onClick={onClose}>{t("done")}</Button>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={onClose}>{t("cancel")}</Button>
              <Button type="submit" disabled={!file || pending}>{pending ? t("importing") : t("submit")}</Button>
            </>
          )}
        </div>
      </form>
    </dialog>,
    document.body,
  );
}

function ImportSummary({ result }: { result: Extract<ImportResult, { ok: true }> }) {
  const t = useTranslations("customers.import");
  const rest = result.skippedTotal - Math.min(result.skipped.length, SHOWN_SKIPS);
  return (
    <div className="space-y-3" role="status">
      <Alert tone={result.imported > 0 ? "success" : "danger"}>{t("imported", { count: result.imported })}</Alert>
      {result.skippedTotal > 0 && (
        <div className="rounded-xl border border-line bg-surface-2 p-4 text-sm">
          <p className="font-medium">{t("skippedTitle", { count: result.skippedTotal })}</p>
          <ul className="mt-2 space-y-1 text-muted">
            {result.skipped.slice(0, SHOWN_SKIPS).map((s) => (
              <li key={s.row}>
                <span className="font-medium text-fg">{t("row", { row: s.row })}</span>: {t(`reasons.${s.reason}`, { fields: (s.fields ?? []).map((f) => CSV_LABELS[f as CsvKey] ?? f).join(", ") })}
              </li>
            ))}
            {rest > 0 && <li>{t("more", { count: rest })}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
