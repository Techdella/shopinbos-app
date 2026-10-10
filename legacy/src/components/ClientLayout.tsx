"use client";

import { ToastProvider } from "@/components/ui/Toast";
import type { ReactNode } from "react";

export function ClientLayout({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
