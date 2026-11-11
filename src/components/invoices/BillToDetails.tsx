import { addressLines } from "@/lib/business";

/** The customer block on the right of "Bill to": name, address on two lines, email, phone. */
export function BillToDetails({ name, address, email, phone }: { name: string; address: string | null; email: string | null; phone: string | null }) {
  return (
    <div className="space-y-0.5 text-right">
      <p className="text-2xl font-semibold tracking-tight">{name || "—"}</p>
      {addressLines(address).map((l) => <p key={l} className="text-base text-muted">{l}</p>)}
      {email && <p className="text-base text-muted">{email}</p>}
      {phone && <p className="text-base text-muted">{phone}</p>}
    </div>
  );
}
