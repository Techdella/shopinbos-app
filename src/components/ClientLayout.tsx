"use client";

import { ToastProvider } from "@/components/ui/Toast";
import { PortalNote } from "@/components/auth/PortalNote";
import { DialogHost } from "@/components/ui/dialogs";
import { ProductAnalytics } from "@/components/analytics/ProductAnalytics";
import { IdleSignOut } from "@/components/auth/IdleSignOut";
import type { ReactNode } from "react";

export function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <PortalNote />
      <DialogHost />
      <ProductAnalytics />
      <IdleSignOut />
      {children}
    </ToastProvider>
  );
}
