/** Formatting allowed in notes: bold, italic, underline, strike, headings, quotes, lists and line breaks. Everything else is removed or escaped. */
const ALLOWED = new Set(["b", "strong", "i", "em", "u", "ul", "ol", "li", "br", "p", "div", "s", "strike", "del", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote"]);
const CANON: Record<string, string> = { strong: "b", em: "i", div: "p", strike: "s", del: "s", h1: "h2", h4: "h3", h5: "h3", h6: "h3" };

const escapeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// "&amp;nbsp;" is repaired too: notes saved before this fix had their "&nbsp;" escaped a second time.
const decode = (s: string) =>
  s.replace(/&amp;nbsp;/g, " ").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/**
 * Turns whatever the editor produced into safe HTML: only the tags above, never with attributes; text is escaped.
 * Plain text (older notes) keeps its line breaks. Safe to call on read and on write.
 */
export function sanitizeNoteHtml(rawInput: string): string {
  // The editor's Markdown shortcuts leave an invisible zero-width space behind; it is never content.
  const input = rawInput.replace(/​/g, "");
  const hasTags = /<\/?[a-z][^>]*>/i.test(input);
  // The editor can return entities with no tags at all (a trailing space is "&nbsp;"). That is HTML, not plain text:
  // treating it as plain text escaped the "&" and showed a literal "&nbsp;".
  if (!hasTags && /&(?:nbsp|amp|lt|gt|quot|#39);/i.test(input)) return sanitizeNoteHtml(`<p>${input}</p>`);
  // Plain text is wrapped in <p> so a second pass sees HTML (and doesn't escape the entities again).
  if (!hasTags) return `<p>${escapeText(input).replace(/\r?\n/g, "<br>")}</p>`;
  const withoutScripts = input.replace(/<(script|style)[\s\S]*?<\/\1\s*>/gi, "");
  let out = "";
  let last = 0;
  const re = /<(\/?)([a-z][a-z0-9]*)\b[^>]*>/gi;
  for (let m = re.exec(withoutScripts); m; m = re.exec(withoutScripts)) {
    out += escapeText(decode(withoutScripts.slice(last, m.index)));
    last = m.index + m[0].length;
    const tag = m[2].toLowerCase();
    if (!ALLOWED.has(tag)) continue;
    const name = CANON[tag] ?? tag;
    out += tag === "br" ? "<br>" : m[1] ? `</${name}>` : `<${name}>`;
  }
  out += escapeText(decode(withoutScripts.slice(last)));
  return out;
}

/** The text a note contains, without formatting (used to reject empty notes). */
export const noteText = (html: string): string => decode(sanitizeNoteHtml(html).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
