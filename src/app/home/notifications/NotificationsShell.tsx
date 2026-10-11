import type { ReactNode } from "react";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AppPage } from "@/components/app-kit";

// The notifications drawer links every role here, so non-sellers get their own portal frame.
export async function NotificationsShell({ title, sub, actions, children }: { title: string; sub: string; actions?: ReactNode; children: ReactNode }) {
  const user = await requireRole(["seller", "supplier", "logistics_partner", "admin"], "/login");

  if (user.role !== "seller") {
    return (
      <AppPage frame={{ role: user.role, userName: user.name, avatarUrl: user.avatarUrl, userEmail: user.email }} title={title} sub={sub} actions={actions}>
        {children}
      </AppPage>
    );
  }

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true } });
  return (
    <SellerPage user={user} store={storeSummary(store)} title={title} sub={sub} actions={actions}>
      {children}
    </SellerPage>
  );
}
