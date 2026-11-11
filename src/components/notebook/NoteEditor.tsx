"use client";

import { useRef, useState } from "react";
import { Bold, Italic, List, ListOrdered, RemoveFormatting, Save, Underline } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";

/** Small rich-text box: bold, italic, underline, lists, clear formatting. The server keeps only those tags. */
export function NoteEditor({ action, placeholder }: { action: (formData: FormData) => void | Promise<void>; placeholder: string }) {
  const t = useTranslations("customers.notes");
  const box = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState("");
  const [hasText, setHasText] = useState(false);

  const sync = () => {
    const el = box.current;
    if (!el) return;
    setHtml(el.innerHTML);
    setHasText((el.textContent ?? "").trim().length > 0);
  };
  const run = (cmd: string) => { box.current?.focus(); document.execCommand(cmd); sync(); };
  const tool = "rounded p-1.5 text-muted hover:bg-surface-2 hover:text-fg";

  return (
    <form action={action} className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-line bg-surface focus-within:border-primary">
        <div role="toolbar" aria-label={t("toolbar")} className="flex items-center gap-0.5 border-b border-line px-2 py-1">
          <button type="button" className={tool} onMouseDown={(e) => e.preventDefault()} onClick={() => run("bold")} aria-label={t("bold")}><Bold className="h-4 w-4" aria-hidden /></button>
          <button type="button" className={tool} onMouseDown={(e) => e.preventDefault()} onClick={() => run("italic")} aria-label={t("italic")}><Italic className="h-4 w-4" aria-hidden /></button>
          <button type="button" className={tool} onMouseDown={(e) => e.preventDefault()} onClick={() => run("underline")} aria-label={t("underline")}><Underline className="h-4 w-4" aria-hidden /></button>
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          <button type="button" className={tool} onMouseDown={(e) => e.preventDefault()} onClick={() => run("insertOrderedList")} aria-label={t("numbered")}><ListOrdered className="h-4 w-4" aria-hidden /></button>
          <button type="button" className={tool} onMouseDown={(e) => e.preventDefault()} onClick={() => run("insertUnorderedList")} aria-label={t("bullets")}><List className="h-4 w-4" aria-hidden /></button>
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          <button type="button" className={tool} onMouseDown={(e) => e.preventDefault()} onClick={() => run("removeFormat")} aria-label={t("clear")}><RemoveFormatting className="h-4 w-4" aria-hidden /></button>
        </div>
        <div
          ref={box} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={placeholder} data-placeholder={placeholder}
          onInput={sync}
          onPaste={(e) => { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")); }}
          className="min-h-28 px-3 py-2 text-sm outline-none empty:before:italic empty:before:text-muted empty:before:content-[attr(data-placeholder)] [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
        />
      </div>
      <input type="hidden" name="body" value={html} />
      <Button type="submit" disabled={!hasText}><Save className="mr-2 h-4 w-4" aria-hidden />{t("save")}</Button>
    </form>
  );
}
