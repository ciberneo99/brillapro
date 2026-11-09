import { Field, Input, Select } from "@/components/ui";
import { DatePicker } from "@/components/ui/DatePicker";
import { MoneyInput } from "@/components/ui/fields";
import { SmartTextInput } from "@/components/ui/SmartTextInput";
import { centsToMoneyText } from "@/lib/money";

export type JobValues = {
  title?: string; service_type_id?: string | null; scheduled_date?: string; start_time?: string | null; end_time?: string | null;
  address?: string | null; access_notes?: string | null; price_cents?: number; notes?: string | null;
};
type Labels = Record<"title" | "service" | "noService" | "date" | "start" | "end" | "address" | "access" | "price" | "notes", string>;

/** Shared fields of the new-job and edit-job forms (server component; all inputs submit by name). */
export function JobFields({
  v, services, labels, dateFormat, currency, dateName = "scheduled_date",
}: { v: JobValues; services: { id: string; name: string }[]; labels: Labels; dateFormat: string; currency: string; dateName?: string }) {
  const ta = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={labels.title} htmlFor="title"><SmartTextInput id="title" name="title" mode="name" defaultValue={v.title ?? ""} required maxLength={120} /></Field>
      <Field label={labels.service} htmlFor="service_type_id">
        <Select id="service_type_id" name="service_type_id" defaultValue={v.service_type_id ?? ""}>
          <option value="">{labels.noService}</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </Field>
      <Field label={labels.date} htmlFor={dateName}><DatePicker id={dateName} name={dateName} defaultValue={v.scheduled_date ?? ""} dateFormat={dateFormat} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={labels.start} htmlFor="start_time"><Input id="start_time" name="start_time" type="time" defaultValue={v.start_time?.slice(0, 5) ?? ""} /></Field>
        <Field label={labels.end} htmlFor="end_time"><Input id="end_time" name="end_time" type="time" defaultValue={v.end_time?.slice(0, 5) ?? ""} /></Field>
      </div>
      <div className="sm:col-span-2"><Field label={labels.address} htmlFor="address"><SmartTextInput id="address" name="address" mode="address" defaultValue={v.address ?? ""} maxLength={300} /></Field></div>
      <Field label={labels.price} htmlFor="price"><MoneyInput id="price" name="price" defaultValue={centsToMoneyText(v.price_cents ?? 0)} currency={currency} /></Field>
      <Field label={labels.access} htmlFor="access_notes"><textarea id="access_notes" name="access_notes" rows={2} maxLength={1000} defaultValue={v.access_notes ?? ""} className={ta} /></Field>
      <div className="sm:col-span-2"><Field label={labels.notes} htmlFor="notes"><textarea id="notes" name="notes" rows={3} maxLength={2000} defaultValue={v.notes ?? ""} className={ta} /></Field></div>
    </div>
  );
}
