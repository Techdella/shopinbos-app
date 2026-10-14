"use client";

import { ToastProvider } from "@/components/ui/Toast";
import { PortalNote } from "@/components/auth/PortalNote";
import type { ReactNode } from "react";

export function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <PortalNote />
      {children}
    </ToastProvider>
  );
}
