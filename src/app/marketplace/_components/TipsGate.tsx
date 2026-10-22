"use client";

import type { ReactNode } from "react";
import { useTipsOn } from "@/components/shell/useShellCounts";

/**
 * Shows a page tip (usually an AssistantNote from a server component) only while tips are on
 * (Customise your menu → Tips and tooltips), the same switch the word tooltips (<Term>) follow.
 */
export function TipsGate({ children }: { children: ReactNode }) {
  const on = useTipsOn();
  return on ? <>{children}</> : null;
}
