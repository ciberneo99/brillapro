import { getTranslations } from "next-intl/server";
import { LogOut } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { PreferenceControls } from "@/components/PreferenceControls";
import { NAV } from "@/lib/navigation";
import { can } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { getTheme } from "@/lib/theme";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const t = await getTranslations("common");
  const theme = await getTheme();

  // Menu only shows what this role may read (server-side filter; routes re-check on their own).
  const items = NAV.filter((n) => can(ctx.role, `${n.resource}:read`)).map(({ key, href }) => ({ key, href }));

  return (
    <div className="min-h-screen lg:pl-64">
      <Sidebar
        items={items}
        companyName={ctx.tenant.name}
        footer={
          <div className="space-y-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{ctx.profile.full_name || ctx.email}</p>
              <p className="truncate text-xs text-muted">{ctx.email}</p>
            </div>
            <PreferenceControls compact theme={theme} />
            <form action="/auth/signout" method="post">
              <button type="submit" className="flex items-center gap-2 text-sm text-muted hover:text-fg">
                <LogOut className="h-4 w-4" aria-hidden /> {t("signOut")}
              </button>
            </form>
          </div>
        }
      />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
