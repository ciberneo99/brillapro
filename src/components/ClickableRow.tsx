"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/components/ui";

/** Anything inside the row that already does something on click keeps doing it. */
const OWN_CLICK = "a,button,input,select,textarea,label,summary,details,[role=menu],[data-no-row]";

/**
 * A table row (or list item) that opens its record when clicked anywhere.
 * The link inside the row stays the keyboard and screen-reader way in, so the row itself adds no extra tab stop.
 * Links, buttons and menus inside the row work as usual, selecting text does not navigate, and Ctrl/Cmd-click or middle-click opens a new tab.
 */
export function ClickableRow({ href, as = "tr", className, children }: { href: string; as?: "tr" | "li"; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const Tag = as;

  const inside = (e: React.MouseEvent) => (e.target as HTMLElement).closest(OWN_CLICK) !== null;
  const onClick = (e: React.MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || inside(e)) return;
    if (window.getSelection()?.toString()) return; // the person is selecting text, not opening the row
    if (e.metaKey || e.ctrlKey) { window.open(href, "_blank", "noopener"); return; }
    router.push(href);
  };
  const onAuxClick = (e: React.MouseEvent) => {
    if (e.button === 1 && !inside(e)) { e.preventDefault(); window.open(href, "_blank", "noopener"); }
  };

  return <Tag onClick={onClick} onAuxClick={onAuxClick} className={cn("cursor-pointer", className)}>{children}</Tag>;
}
