"use client";

import { Children, Fragment, isValidElement, useState, type ReactElement, type ReactNode, type SelectHTMLAttributes } from "react";
import { SelectMenu, type MenuOption } from "@/components/ui/SelectMenu";

function text(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement(node)) return text((node.props as { children?: ReactNode }).children);
  return "";
}

function collect(nodes: ReactNode, out: MenuOption[]) {
  Children.forEach(nodes, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{ value?: string | number; disabled?: boolean; children?: ReactNode }>;
    if (el.type === Fragment || el.type === "optgroup") { collect(el.props.children, out); return; }
    if (el.type === "option") {
      const label = text(el.props.children);
      out.push({ value: el.props.value !== undefined ? String(el.props.value) : label, label, disabled: el.props.disabled });
    }
  });
}

/**
 * Drop-in replacement for a native <select>: reads its <option> children and shows the app's own menu (glow on hover).
 * Keeps `name`, `required`, `defaultValue`/`value`, `disabled` and an `onChange` that receives `e.target.value`.
 */
export function SelectField({ children, className, name, id, value, defaultValue, onChange, required, disabled, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  const options: MenuOption[] = [];
  collect(children, options);
  const first = options.find((o) => !o.disabled)?.value ?? "";
  const [inner, setInner] = useState(defaultValue !== undefined ? String(defaultValue) : first);
  const current = value !== undefined ? String(value) : inner;

  const tokens = (className ?? "").split(/\s+/).filter(Boolean);
  const wrapper = tokens.filter((c) => /^(max-|min-)?w-/.test(c)).join(" ");
  const trigger = tokens.filter((c) => !/^(max-|min-)?w-/.test(c)).join(" ");

  return (
    <div className={`relative ${wrapper || "w-full"}`}>
      <SelectMenu
        id={id} name={name} value={current} options={options} disabled={disabled} className={trigger}
        ariaLabel={(rest["aria-label"] as string | undefined) ?? name ?? id ?? "select"}
        onChange={(v) => {
          setInner(v);
          onChange?.({ target: { value: v, name }, currentTarget: { value: v, name } } as unknown as React.ChangeEvent<HTMLSelectElement>);
        }}
      />
      {required && (
        <input required value={current} onChange={() => {}} tabIndex={-1} aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0" />
      )}
    </div>
  );
}
