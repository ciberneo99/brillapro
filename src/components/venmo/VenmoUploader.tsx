"use client";

import { useRef, useState, useTransition } from "react";
import { FileSpreadsheet, UploadCloud } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert, Button, Card, cn } from "@/components/ui";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { analyzeVenmo } from "@/modules/venmo/actions";
import type { VenmoReport } from "@/modules/venmo/parse";

export function VenmoUploader({ currency, dateFormat }: { currency: string; dateFormat: string }) {
  const t = useTranslations("venmo");
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<VenmoReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [downloading, setDownloading] = useState(false);
  const [over, setOver] = useState(false);
  const m = (c: number) => formatMoney(c, currency);
  const d = (v: string | null) => (v ? formatDateOnly(v, dateFormat) : "");

  function choose(f: File | null) {
    setFile(f); setReport(null); setError(null);
    if (!f) return;
    const body = new FormData();
    body.set("file", f);
    start(async () => {
      const res = await analyzeVenmo(body);
      if (res.ok) setReport(res.report);
      else setError(res.error);
    });
  }

  async function download() {
    if (!file) return;
    setDownloading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/venmo/pdf", { method: "POST", body });
      if (!res.ok) { setError("pdf"); return; }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "venmo-report.pdf";
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setDownloading(false);
    }
  }

  const r = report;
  return (
    <div className="space-y-6">
      <Card accent="blue" className="space-y-3">
        <h2 className="text-base font-semibold">{t("upload")}</h2>
        <p className="text-sm text-muted">{t("uploadHelp")}</p>
        <input ref={input} id="venmo-file" type="file" accept=".csv,text/csv" onChange={(e) => choose(e.target.files?.[0] ?? null)} className="sr-only" />
        <label
          htmlFor="venmo-file"
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) choose(f); }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors focus-within:ring-2 focus-within:ring-primary",
            over ? "border-primary bg-primary-soft" : "border-line bg-surface-2 hover:border-primary hover:bg-primary-soft",
          )}
        >
          {file ? <FileSpreadsheet className="h-10 w-10 text-primary" aria-hidden /> : <UploadCloud className="h-10 w-10 text-primary" aria-hidden />}
          <span className="text-sm font-semibold">{file ? file.name : t("dropTitle")}</span>
          <span className="text-xs text-muted">{file ? t("dropChange") : t("dropHint")}</span>
        </label>
        {file && <div><Button type="button" variant="ghost" onClick={() => { if (input.current) input.current.value = ""; choose(null); }}>{t("clear")}</Button></div>}
        <p className="text-xs text-muted">{t("privacy")}</p>
      </Card>

      {pending && <p className="text-sm text-muted">{t("reading")}</p>}
      {error && <Alert>{t(`errors.${error}`)}</Alert>}

      {r && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{t("reportTitle")}</h2>
              <p className="text-sm text-muted">{r.account && <>{r.account} · </>}{d(r.from)} – {d(r.to)}</p>
            </div>
            <Button type="button" onClick={download} disabled={downloading}>{downloading ? t("preparing") : t("downloadPdf")}</Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card accent="green"><p className="text-sm text-muted">{t("received")} ({r.received.count})</p><p className="mt-1 text-2xl font-semibold">{m(r.received.cents)}</p></Card>
            <Card accent="blue"><p className="text-sm text-muted">{t("transfers")} ({r.transfers.count})</p><p className="mt-1 text-2xl font-semibold">{m(r.transfers.cents)}</p></Card>
            {r.sent.count > 0 && <Card accent="rose"><p className="text-sm text-muted">{t("sent")} ({r.sent.count})</p><p className="mt-1 text-2xl font-semibold">{m(r.sent.cents)}</p></Card>}
            {r.fees_cents > 0 && <Card accent="amber"><p className="text-sm text-muted">{t("fees")}</p><p className="mt-1 text-2xl font-semibold">{m(r.fees_cents)}</p></Card>}
            {r.beginning_cents !== null && <Card accent="teal"><p className="text-sm text-muted">{t("beginning")}</p><p className="mt-1 text-2xl font-semibold">{m(r.beginning_cents)}</p></Card>}
            {r.ending_cents !== null && <Card accent="violet"><p className="text-sm text-muted">{t("ending")}</p><p className="mt-1 text-2xl font-semibold">{m(r.ending_cents)}</p></Card>}
          </div>

          {r.difference_cents !== null && (
            <Alert tone={r.difference_cents === 0 ? "success" : "danger"}>
              {r.difference_cents === 0 ? t("checkOk") : `${t("checkBad")} ${m(Math.abs(r.difference_cents))}`}
            </Alert>
          )}
          {r.excluded > 0 && <p className="text-sm text-muted">{t("excluded")} {r.excluded}</p>}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card accent="green" className="p-0">
              <h3 className="p-4 pb-2 text-base font-semibold">{t("byClient")}</h3>
              <ul className="divide-y divide-line text-sm">
                {r.byClient.map((g) => (
                  <li key={g.name} className="flex justify-between gap-3 px-4 py-2"><span>{g.name} <span className="text-muted">({g.count})</span></span><span className="font-medium">{m(g.cents)}</span></li>
                ))}
              </ul>
            </Card>
            <Card accent="amber" className="p-0">
              <h3 className="p-4 pb-2 text-base font-semibold">{t("byWeek")}</h3>
              <ul className="divide-y divide-line text-sm">
                {r.byWeek.map((g) => (
                  <li key={g.name} className="flex justify-between gap-3 px-4 py-2"><span>{d(g.name)} <span className="text-muted">({g.count})</span></span><span className="font-medium">{m(g.cents)}</span></li>
                ))}
              </ul>
            </Card>
          </div>

          <Card accent="blue" className="overflow-x-auto p-0">
            <h3 className="p-4 pb-2 text-base font-semibold">{t("transactions")} ({r.transactions.length})</h3>
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs uppercase text-muted">
                <tr><th className="p-3">{t("date")}</th><th className="p-3">{t("kind")}</th><th className="p-3">{t("who")}</th><th className="p-3">{t("note")}</th><th className="p-3 text-right">{t("amount")}</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {r.transactions.map((x) => (
                  <tr key={x.id}>
                    <td className="whitespace-nowrap p-3">{d(x.date)}</td>
                    <td className="p-3">{t(`kinds.${x.kind}`)}</td>
                    <td className="p-3">{x.counterparty}</td>
                    <td className="p-3 text-muted">{x.note}</td>
                    <td className={cn("whitespace-nowrap p-3 text-right font-medium", x.amount_cents < 0 ? "text-danger" : "text-success")}>{x.amount_cents < 0 ? "-" : ""}{m(Math.abs(x.amount_cents))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
