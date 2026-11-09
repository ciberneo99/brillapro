import { getTranslations } from "next-intl/server";
import { Field, Input } from "@/components/ui";
import { MoneyInput, SmartTextarea } from "@/components/ui/fields";
import { SmartTextInput } from "@/components/ui/SmartTextInput";
import { centsToMoneyText } from "@/lib/money";
import type { InventoryItem } from "@/modules/inventory/queries";

/** Shared fields for creating and editing an inventory item (rendered inside a <form>). */
export async function ItemFields({ value, currency }: { value?: InventoryItem; currency: string }) {
  const t = await getTranslations("inventory");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label={t("name")} htmlFor="name"><SmartTextInput id="name" name="name" mode="name" required maxLength={120} defaultValue={value?.name ?? ""} /></Field>
      </div>
      <Field label={t("unit")} htmlFor="unit" hint={t("unitHint")}><Input id="unit" name="unit" maxLength={30} defaultValue={value?.unit ?? ""} placeholder="bottle" /></Field>
      <Field label={t("minimum")} htmlFor="min_quantity" hint={t("minimumHint")}><Input id="min_quantity" name="min_quantity" inputMode="decimal" defaultValue={value ? String(value.min_quantity) : "0"} /></Field>
      <Field label={t("unitCost")} htmlFor="unit_cost"><MoneyInput id="unit_cost" name="unit_cost" currency={currency} defaultValue={centsToMoneyText(value?.unit_cost_cents)} /></Field>
      <div className="sm:col-span-2">
        <Field label={t("notes")} htmlFor="notes"><SmartTextarea id="notes" name="notes" rows={2} maxLength={500} defaultValue={value?.notes ?? ""} /></Field>
      </div>
    </div>
  );
}
