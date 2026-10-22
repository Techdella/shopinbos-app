"use client";

import type { ReactNode } from "react";
import { AssistantNote } from "@/components/app-kit";
import { useTipsOn } from "@/components/shell/useShellCounts";

/**
 * A short Peggy (or Rex) tip at the top of a page, for first-time sellers. Hidden while the person has switched
 * tips off (Customise your menu → Tips and tooltips, /home/features#tips), the same switch <Term> tooltips and
 * the marketplace/delivery tips follow. Usable from server components: pass the translated text as children.
 */
export function PageTip({
  children,
  who = "peggy",
  action,
  className,
}: {
  children: ReactNode;
  who?: "peggy" | "rex";
  action?: ReactNode;
  /** Spacing around the tip, e.g. "mb-5" when the page body isn't a grid with gaps. */
  className?: string;
}) {
  const on = useTipsOn();
  if (!on) return null;
  const note = (
    <AssistantNote who={who} action={action}>
      {children}
    </AssistantNote>
  );
  return className ? <div className={className}>{note}</div> : note;
}
