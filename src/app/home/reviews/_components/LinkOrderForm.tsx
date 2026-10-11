"use client";

import { useActionState } from "react";
import { linkReviewOrder, type ActionState } from "@/app/actions/reviews";
import { Notice, PillButton } from "@/components/app-ui";
import { field } from "@/components/seller-core";

export function LinkOrderForm({ reviewKey, orderNumber }: { reviewKey: string; orderNumber: string | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(linkReviewOrder, null);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="key" value={reviewKey} />
      <label htmlFor="orderNumber" className={field.label}>Order number</label>
      <div className="flex flex-wrap gap-2">
        <input id="orderNumber" name="orderNumber" defaultValue={orderNumber ?? ""} placeholder="e.g. SB-10234" className={`${field.input} min-w-[160px] flex-1`} />
        <PillButton type="submit" size="md" tone="white" busy={pending}>{orderNumber ? "Update" : "Mark verified"}</PillButton>
      </div>
      <p className={field.hint}>Link the customer&apos;s paid order to show them as a verified buyer. Clear the box and save to remove it.</p>
      {state ? <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice> : null}
    </form>
  );
}
