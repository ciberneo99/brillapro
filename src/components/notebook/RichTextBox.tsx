"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Heading2, Heading3, Italic, List, ListOrdered, Quote, Redo2, RemoveFormatting, Strikethrough, Underline, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import clsx from "clsx";

type Cmd = { id: string; icon: typeof Bold; label: string; active?: boolean };

/**
 * Rich-text box for notes. Toolbar with live state (bold, italic, underline, strike, headings, quote, lists, undo/redo),
 * Markdown shortcuts ("- ", "1. ", "# ", "## ", "> ") and the usual keyboard shortcuts (Ctrl+B / I / U / Z). Pastes as plain text.
 * Its HTML goes in a hidden input called `name`; the server sanitizes it again, so only the allowed tags are ever stored.
 */
export function RichTextBox({
  name = "body", placeholder, initialHtml = "", minHeight = "min-h-28", onTextChange,
}: { name?: string; placeholder: string; initialHtml?: string; minHeight?: string; onTextChange?: (hasText: boolean) => void }) {
  const t = useTranslations("customers.notes");
  const box = useRef<HTMLDivElement>(null);
  const [initial] = useState(initialHtml);
  const [html, setHtml] = useState(initialHtml);
  const [on, setOn] = useState<Record<string, boolean>>({});

  const sync = () => {
    const el = box.current;
    if (!el) return;
    setHtml(el.innerHTML.replace(/​/g, ""));
    onTextChange?.((el.textContent ?? "").replace(/​/g, "").trim().length > 0);
  };

  useEffect(() => {
    const read = () => {
      const el = box.current;
      const sel = window.getSelection();
      if (!el || !sel || !sel.anchorNode || !el.contains(sel.anchorNode)) return;
      const block = String(document.queryCommandValue("formatBlock")).toLowerCase().replace(/[<>]/g, "");
      setOn({
        bold: document.queryCommandState("bold"), italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"), strike: document.queryCommandState("strikeThrough"),
        ul: document.queryCommandState("insertUnorderedList"), ol: document.queryCommandState("insertOrderedList"),
        h2: block === "h2", h3: block === "h3", quote: block === "blockquote",
      });
    };
    document.addEventListener("selectionchange", read);
    return () => document.removeEventListener("selectionchange", read);
  }, []);

  const exec = (cmd: string, value?: string) => { box.current?.focus(); document.execCommand(cmd, false, value); sync(); };
  const block = (tag: "h2" | "h3" | "blockquote", key: string) => exec("formatBlock", on[key] ? "<p>" : `<${tag}>`);
  const act = (id: string) => {
    switch (id) {
      case "undo": case "redo": return exec(id);
      case "h2": return block("h2", "h2");
      case "h3": return block("h3", "h3");
      case "bold": case "italic": case "underline": return exec(id);
      case "strike": return exec("strikeThrough");
      case "bullets": return exec("insertUnorderedList");
      case "numbered": return exec("insertOrderedList");
      case "quote": return block("blockquote", "quote");
      case "clear": exec("removeFormat"); return exec("formatBlock", "<p>");
    }
  };

  const groups: Cmd[][] = [
    [
      { id: "undo", icon: Undo2, label: t("undo") },
      { id: "redo", icon: Redo2, label: t("redo") },
    ],
    [
      { id: "h2", icon: Heading2, label: t("heading"), active: on.h2 },
      { id: "h3", icon: Heading3, label: t("subheading"), active: on.h3 },
    ],
    [
      { id: "bold", icon: Bold, label: t("bold"), active: on.bold },
      { id: "italic", icon: Italic, label: t("italic"), active: on.italic },
      { id: "underline", icon: Underline, label: t("underline"), active: on.underline },
      { id: "strike", icon: Strikethrough, label: t("strike"), active: on.strike },
    ],
    [
      { id: "bullets", icon: List, label: t("bullets"), active: on.ul },
      { id: "numbered", icon: ListOrdered, label: t("numbered"), active: on.ol },
      { id: "quote", icon: Quote, label: t("quote"), active: on.quote },
    ],
    [
      { id: "clear", icon: RemoveFormatting, label: t("clear") },
    ],
  ];

  /** Markdown shortcuts: typing the marker and a space at the start of a line turns it into a list, heading or quote. */
  const shortcut = (e: React.KeyboardEvent) => {
    if (e.key !== " " || e.nativeEvent.isComposing) return;
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (!sel || !sel.isCollapsed || !node || node.nodeType !== Node.TEXT_NODE || node.previousSibling) return;
    const marker = (node.textContent ?? "").slice(0, sel.anchorOffset);
    const rest = (node.textContent ?? "").slice(sel.anchorOffset);
    let cmd: [string, string?] | null = null;
    if (marker === "-" || marker === "*") cmd = ["insertUnorderedList"];
    else if (/^\d{1,3}\.$/.test(marker)) cmd = ["insertOrderedList"];
    else if (marker === "#") cmd = ["formatBlock", "<h2>"];
    else if (marker === "##") cmd = ["formatBlock", "<h3>"];
    else if (marker === ">") cmd = ["formatBlock", "<blockquote>"];
    if (!cmd) return;
    e.preventDefault();
    node.textContent = rest || "​"; // keeps a node to put the caret in
    const r = document.createRange();
    r.setStart(node, rest ? 0 : 1); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
    document.execCommand(cmd[0], false, cmd[1]);
    sync();
  };

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface focus-within:border-primary">
      <div role="toolbar" aria-label={t("toolbar")} className="flex flex-wrap items-center gap-x-0.5 gap-y-0.5 border-b border-line bg-surface-2 px-2 py-1">
        {groups.map((g, gi) => (
          <div key={gi} className="flex items-center gap-0.5">
            {gi > 0 && <span className="mx-1 h-5 w-px bg-line" aria-hidden />}
            {g.map(({ id, icon: Icon, label, active }) => (
              <button
                key={id} type="button" title={label} aria-label={label} aria-pressed={active === undefined ? undefined : active}
                onMouseDown={(e) => e.preventDefault()} onClick={() => act(id)}
                className={clsx("rounded-md p-1.5 transition-colors hover:bg-primary-soft hover:text-primary", active ? "bg-primary-soft text-primary" : "text-muted")}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </button>
            ))}
          </div>
        ))}
      </div>
      <div
        ref={box} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={placeholder} data-placeholder={placeholder}
        dangerouslySetInnerHTML={{ __html: initial }}
        onInput={sync} onKeyDown={shortcut}
        onPaste={(e) => { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")); }}
        className={clsx("note-prose px-3 py-2 text-sm outline-none empty:before:italic empty:before:text-muted empty:before:content-[attr(data-placeholder)]", minHeight)}
      />
      <input type="hidden" name={name} value={html} />
    </div>
  );
}
