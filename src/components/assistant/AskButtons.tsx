"use client";

import { useRexDrawer } from "@/components/rex/RexDrawerContext";
import { OPEN_HELP_EVENT } from "@/components/simple/HelpButton";
import { useTipsOn } from "@/components/shell/useShellCounts";
import { useT } from "@/components/i18n/I18nProvider";
import type { ReactNode } from "react";

// "Ask Peggy" opens the help panel the shell already mounts; "Ask Rex" opens the Rex drawer, with a first
// question when given (src/components/rex/RexDrawerContext.tsx).

const PILL = "inline-flex min-h-[36px] items-center rounded-full border border-app-line bg-white px-3.5 text-[13px] font-extrabold text-app-ink hover:border-app-line-strong";

export function AskPeggy() {
  const t = useT("briefs");
  return <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_HELP_EVENT))} className={PILL}>{t("askPeggy")}</button>;
}

export function AskRex({ question }: { question?: string }) {
  const t = useT("briefs");
  const { openDrawer } = useRexDrawer();
  return <button type="button" onClick={() => openDrawer(question)} className={PILL}>{t("askRex")}</button>;
}

/** Rex's ideas are suggestions, so they follow the tips switch (Customise your menu → Tips and tooltips). */
export function IdeasGate({ children }: { children: ReactNode }) {
  return useTipsOn() ? <>{children}</> : null;
}
