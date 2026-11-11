import { describe, expect, it } from "vitest";
import { noteText, sanitizeNoteHtml } from "@/lib/note-html";

describe("sanitizeNoteHtml", () => {
  it("keeps the allowed formatting and drops attributes", () => {
    expect(sanitizeNoteHtml('<b onclick="x()">Hi</b> <i style="color:red">there</i>')).toBe("<b>Hi</b> <i>there</i>");
    expect(sanitizeNoteHtml("<ul><li>a</li><li>b</li></ul>")).toBe("<ul><li>a</li><li>b</li></ul>");
    expect(sanitizeNoteHtml("<strong>x</strong><em>y</em>")).toBe("<b>x</b><i>y</i>");
  });
  it("removes scripts, handlers, links and unknown tags", () => {
    expect(sanitizeNoteHtml("<p>ok</p><script>alert(1)</script>")).toBe("<p>ok</p>");
    expect(sanitizeNoteHtml('<img src=x onerror="alert(1)">hello')).toBe("hello");
    expect(sanitizeNoteHtml('<a href="javascript:alert(1)">go</a>')).toBe("go");
    expect(sanitizeNoteHtml("<iframe src='//evil'></iframe>text")).toBe("text");
  });
  it("escapes text that only looks like markup", () => {
    expect(sanitizeNoteHtml("<b>1 &lt; 2 &amp; 3</b>")).toBe("<b>1 &lt; 2 &amp; 3</b>");
    expect(sanitizeNoteHtml("a < b and c > d")).toBe("<p>a &lt; b and c &gt; d</p>");
    expect(sanitizeNoteHtml("<b>&lt;script&gt;alert(1)&lt;/script&gt;</b>")).toBe("<b>&lt;script&gt;alert(1)&lt;/script&gt;</b>");
  });
  it("keeps line breaks of plain-text notes", () => {
    expect(sanitizeNoteHtml("one\ntwo <3")).toBe("<p>one<br>two &lt;3</p>");
  });
  it("is idempotent", () => {
    const once = sanitizeNoteHtml('<div>x <b>y</b></div><ol><li>1</li></ol>&nbsp;');
    expect(sanitizeNoteHtml(once)).toBe(once);
    const plain = sanitizeNoteHtml("1 < 2 & 3");
    expect(sanitizeNoteHtml(plain)).toBe(plain);
  });
});

describe("noteText", () => {
  it("returns the visible text", () => {
    expect(noteText("<p><b>Hello</b> world</p><br>")).toBe("Hello world");
    expect(noteText("<p><br></p>")).toBe("");
  });
});
