import type { ReactNode } from "react";
import { displayUrl } from "@/lib/business";

export type SheetCompany = { name: string; address: string | null; phone: string | null; email: string | null; taxId: string | null; website?: string | null; logoUrl: string | null };

/** Top of the invoice sheet, three columns: logo | company address | invoice details (passed as children). Stacks on phones. */
export function SheetHeader({ company, alt, children }: { company: SheetCompany; alt: string; children: ReactNode }) {
  return (
    <div className="grid gap-6 border-b border-line pb-6 md:grid-cols-3">
      <div className="flex items-start">
        {company.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img src={company.logoUrl} alt={alt} className="max-h-24 max-w-full object-contain" />
        ) : (
          <div aria-hidden className="flex h-20 w-20 items-center justify-center rounded-xl bg-primary text-3xl font-bold text-white">
            {company.name.trim().charAt(0).toUpperCase() || "B"}
          </div>
        )}
      </div>
      <div className="space-y-0.5 text-sm">
        <p className="text-base font-semibold">{company.name}</p>
        {company.address && <p className="whitespace-pre-line text-muted">{company.address}</p>}
        {company.phone && <p className="text-muted">{company.phone}</p>}
        {company.email && <p className="text-muted">{company.email}</p>}
        {company.website && <p className="text-muted">{displayUrl(company.website)}</p>}
        {company.taxId && <p className="text-muted">{company.taxId}</p>}
      </div>
      <div className="md:text-right">{children}</div>
    </div>
  );
}
