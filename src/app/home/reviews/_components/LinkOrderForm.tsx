"use client";

import { useActionState } from "react";
import { linkReviewOrder, type ActionState } from "@/app/actions/reviews";
import { Notice, PillButton } from "@/components/app-ui";
import { field } from "@/components/seller-core";
import { useT } from "@/components/i18n/I18nProvider";

export function LinkOrderForm({ reviewKey, orderNumber }: { reviewKey: string; orderNumber: string | null }) {
  const t = useT("reviews");
  const [state, action, pending] = useActionState<ActionState, FormData>(linkReviewOrder, null);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="key" value={reviewKey} />
      <label htmlFor="orderNumber" className={field.label}>{t("order.label")}</label>
      <div className="flex flex-wrap gap-2">
        <input id="orderNumber" name="orderNumber" defaultValue={orderNumber ?? ""} placeholder={t("order.placeholder")} className={`${field.input} min-w-[160px] flex-1`} />
        <PillButton type="submit" size="md" tone="white" busy={pending}>{orderNumber ? t("order.update") : t("order.markVerified")}</PillButton>
      </div>
      <p className={field.hint}>{t("order.hint")}</p>
      {state ? <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice> : null}
    </form>
  );
}
