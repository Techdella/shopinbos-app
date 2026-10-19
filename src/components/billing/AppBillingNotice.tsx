"use client";

import { Card } from "@/components/app-kit";
import { useT } from "@/components/i18n/I18nProvider";

/** Shown instead of plans, billing and credits on pages the phone app opened (see src/lib/app-session.ts). */
export function AppBillingNotice() {
  const t = useT("payments");
  return <Card className="p-5"><p className="m-0 text-[14px] leading-[1.5]">{t("app.billingOff")}</p></Card>;
}
