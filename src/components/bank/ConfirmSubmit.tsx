"use client";

import type { ButtonHTMLAttributes } from "react";

/** A submit button that asks "are you sure?" first. Used for deletes. */
export function ConfirmSubmit({ message, ...props }: { message: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="submit" {...props} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }} />;
}
