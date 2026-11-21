"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { RichTextBox } from "./RichTextBox";

/** Rich-text box plus Save button, used for the notes on a customer page. The server keeps only the allowed tags. */
export function NoteEditor({ action, placeholder }: { action: (formData: FormData) => void | Promise<void>; placeholder: string }) {
  const t = useTranslations("customers.notes");
  const [hasText, setHasText] = useState(false);
  return (
    <form action={action} className="space-y-3">
      <RichTextBox placeholder={placeholder} onTextChange={setHasText} />
      <Button type="submit" disabled={!hasText}><Save className="mr-2 h-4 w-4" aria-hidden />{t("save")}</Button>
    </form>
  );
}
