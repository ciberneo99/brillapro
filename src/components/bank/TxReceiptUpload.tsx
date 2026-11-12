"use client";

import { useRef } from "react";
import { Paperclip } from "lucide-react";

/** The paperclip of a bank line: picking a file uploads it right away. */
export function TxReceiptUpload({ action, back, label }: { action: (formData: FormData) => Promise<void>; back: string; label: string }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="inline-block">
      <input type="hidden" name="back" value={back} />
      <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-dashed border-line text-muted hover:border-primary hover:bg-primary-soft hover:text-primary focus-within:ring-2 focus-within:ring-primary" title={label}>
        <Paperclip className="h-4 w-4" aria-hidden />
        <span className="sr-only">{label}</span>
        <input type="file" name="receipt" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only"
          onChange={(e) => { if (e.currentTarget.files?.length) form.current?.requestSubmit(); }} />
      </label>
    </form>
  );
}
