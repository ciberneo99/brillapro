import { getTranslations } from "next-intl/server";
import { CategoryPicker } from "@/components/bank/CategoryPicker";
import { Field, Select } from "@/components/ui";
import { DatePicker } from "@/components/ui/DatePicker";
import { MoneyInput, SmartTextarea } from "@/components/ui/fields";
import { SmartTextInput } from "@/components/ui/SmartTextInput";
import { centsToMoneyText } from "@/lib/money";
import { EXPENSE_METHODS } from "@/modules/expenses/schema";
import type { Category, ExpenseRow } from "@/modules/expenses/queries";

export type JobOption = { id: string; title: string; customer_name: string; scheduled_date: string };

/** Shared fields for creating and editing an expense (rendered inside a <form>). */
export async function ExpenseFields({
  categories, jobs, value, today, dateFormat, currency,
}: {
  categories: Category[]; jobs: JobOption[]; value?: ExpenseRow; today: string; dateFormat: string; currency: string;
}) {
  const t = await getTranslations("expenses");
  const tm = await getTranslations("invoices.method");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t("date")} htmlFor="expense_date">
        <DatePicker id="expense_date" name="expense_date" defaultValue={value?.expense_date ?? today} dateFormat={dateFormat} />
      </Field>
      <Field label={t("amount")} htmlFor="amount">
        <MoneyInput id="amount" name="amount" required defaultValue={value ? centsToMoneyText(value.amount_cents) : ""} currency={currency} />
      </Field>
      <Field label={t("category")} htmlFor="category_id">
        <CategoryPicker name="category_id" defaultValue={value?.category_id ?? ""} choices={categories.map((c) => ({ id: c.id, name: c.name, parent: c.parent }))} placeholder={t("chooseCategory")} ariaLabel={t("category")} />
      </Field>
      <Field label={t("vendor")} htmlFor="vendor">
        <SmartTextInput id="vendor" name="vendor" mode="name" maxLength={120} defaultValue={value?.vendor ?? ""} />
      </Field>
      <Field label={t("method")} htmlFor="payment_method">
        <Select id="payment_method" name="payment_method" defaultValue={value?.payment_method ?? ""}>
          <option value="">—</option>
          {EXPENSE_METHODS.map((m) => <option key={m} value={m}>{tm(m)}</option>)}
        </Select>
      </Field>
      <Field label={t("job")} htmlFor="job_id" hint={t("jobHint")}>
        <Select id="job_id" name="job_id" defaultValue={value?.job_id ?? ""}>
          <option value="">—</option>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.scheduled_date} · {j.customer_name} · {j.title}</option>)}
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Field label={t("description")} htmlFor="description">
          <SmartTextarea id="description" name="description" rows={2} maxLength={500} defaultValue={value?.description ?? ""} />
        </Field>
      </div>
    </div>
  );
}
