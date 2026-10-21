"use client";

import type { ReactNode } from "react";
import { useTipsOn } from "@/components/shell/useShellCounts";

// Wraps a Peggy tip (<AssistantNote>) on the seller delivery pages so it hides when the person has switched tips
// and tooltips off (Customise your menu → Tips and tooltips), the same switch <Term> follows.
export function DeliveryTip({ children }: { children: ReactNode }) {
  const tipsOn = useTipsOn();
  if (!tipsOn) return null;
  return <>{children}</>;
}
