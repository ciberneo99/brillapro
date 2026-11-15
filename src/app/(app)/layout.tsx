import { getTranslations } from "next-intl/server";
import { LogOut } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { PreferenceControls } from "@/components/PreferenceControls";
import { PaymentMethodsProvider } from "@/components/PaymentMethodsProvider";
import { listPaymentMethods } from "@/modules/payment-methods/queries";
import { NAV } from "@/lib/navigation";
import { can } from "@/lib/permissions";
import { isPlatformAdmin, requireContext } from "@/lib/session";
import { getTheme } from "@/lib/theme";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [ctx, platformAdmin, t, theme, methods] = await Promise.all([requireContext(), isPlatformAdmin(), getTranslations("common"), getTheme(), listPaymentMethods()]);

  // Menu only shows what this role may read (server-side filter; routes re-check on their own).
  const items = NAV.filter((n) => can(ctx.role, `${n.resource}:read`)).map(({ key, href }) => ({ key, href }));
  // Only platform staff see the link to the company admin panel (the page itself re-checks).
  if (platformAdmin) items.push({ key: "platformAdmin", href: "/admin" });

  return (
    <div className="min-h-screen lg:pl-64">
      <Sidebar
        items={items}
        companyName={ctx.tenant.name}
        footer={
          <div className="space-y-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{ctx.profile.full_name || ctx.email}</p>
              <p className="truncate text-xs opacity-75">{ctx.email}</p>
            </div>
            <PreferenceControls compact theme={theme} />
            <form action="/auth/signout" method="post">
              <button type="submit" className="flex items-center gap-2 text-sm opacity-80 hover:opacity-100">
                <LogOut className="h-4 w-4" aria-hidden /> {t("signOut")}
              </button>
            </form>
          </div>
        }
      />
      <main className="mx-auto min-w-0 max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
        <PaymentMethodsProvider methods={methods.map(({ code, name, is_active }) => ({ code, name, is_active }))}>{children}</PaymentMethodsProvider>
      </main>
    </div>
  );
}
