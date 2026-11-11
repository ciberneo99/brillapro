import { addressLines } from "@/lib/business";

/** The customer block on the right of "Bill to": company first (when there is one), then the person, address on two lines, email, phone. */
export function BillToDetails({ name, company, address, email, phone }: { name: string; company?: string | null; address: string | null; email: string | null; phone: string | null }) {
  const co = company?.trim() || "";
  const person = name.trim();
  const showPerson = person && person.toLowerCase() !== co.toLowerCase();
  return (
    <div className="space-y-0.5 text-right">
      <p className="text-2xl font-semibold tracking-tight">{co || person || "—"}</p>
      {co && showPerson && <p className="text-lg font-medium">{person}</p>}
      {addressLines(address).map((l) => <p key={l} className="text-base text-muted">{l}</p>)}
      {email && <p className="text-base text-muted">{email}</p>}
      {phone && <p className="text-base text-muted">{phone}</p>}
    </div>
  );
}
