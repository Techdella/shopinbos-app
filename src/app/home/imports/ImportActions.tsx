"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PillButton } from "@/components/app-ui";
import { PillLink } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { acceptImportQuote, addImportToProducts, cancelImportRequest, declineImportQuote } from "@/app/actions/imports";

export interface ImportActionLabels {
  /** Has an {amount} placeholder. */
  acceptPay: string;
  accept: string;
  decline: string;
  declineReason: string;
  declineSend: string;
  keep: string;
  payAgain: string;
  cancel: string;
  addToProducts: string;
  inProducts: string;
  failed: string;
}

/** My imports: the buttons under an import (accept and pay, decline, cancel, add to products). */
export function ImportActions({
  id,
  labels,
  total,
  paymentUrl,
  canAccept,
  accepted,
  canCancel,
  canAdd,
  storeProductId,
}: {
  id: string;
  labels: ImportActionLabels;
  total: string | null;
  paymentUrl: string | null;
  canAccept: boolean;
  accepted: boolean;
  canCancel: boolean;
  canAdd: boolean;
  storeProductId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");

  function act(key: string, work: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) {
    setBusy(key);
    setError(null);
    start(async () => {
      const result = await work().catch(() => ({ ok: false as const, error: labels.failed }));
      setBusy(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      after?.();
      router.refresh();
    });
  }

  const accept = () => {
    // Open the payment page in the click itself, so the browser doesn't block it as a pop-up.
    if (paymentUrl) window.open(paymentUrl, "_blank", "noopener");
    act("accept", () => acceptImportQuote(id));
  };

  const actions = [];
  if (canAccept && !accepted) {
    actions.push(
      <PillButton key="accept" size="md" busy={pending && busy === "accept"} onClick={accept}>
        <Icon name="check" size={16} /> {total && paymentUrl ? labels.acceptPay.replace("{amount}", total) : labels.accept}
      </PillButton>,
    );
  }
  if (canAccept && accepted && paymentUrl) {
    actions.push(<PillLink key="pay" href={paymentUrl} tone="ink" icon="card">{labels.payAgain}</PillLink>);
  }
  if (canAccept && !accepted && !declining) {
    actions.push(<PillButton key="decline" size="md" tone="white" onClick={() => setDeclining(true)}>{labels.decline}</PillButton>);
  }
  if (canCancel && !canAccept) {
    actions.push(
      <PillButton key="cancel" size="sm" tone="ghost" busy={pending && busy === "cancel"} onClick={() => act("cancel", () => cancelImportRequest(id))}>
        {labels.cancel}
      </PillButton>,
    );
  }
  if (canAdd && storeProductId) {
    actions.push(<PillLink key="product" href={`/products/${storeProductId}`} icon="package">{labels.inProducts}</PillLink>);
  } else if (canAdd) {
    actions.push(
      <PillButton key="add" size="md" busy={pending && busy === "add"} onClick={() => act("add", () => addImportToProducts(id))}>
        <Icon name="plus" size={16} /> {labels.addToProducts}
      </PillButton>,
    );
  }

  if (!actions.length && !declining && !error) return null;
  return (
    <div className="grid gap-3">
      {actions.length ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      {declining ? (
        <div className="grid gap-2 rounded-[16px] bg-app-canvas p-3">
          <label className="grid gap-1.5 text-[13px] font-bold">
            {labels.declineReason}
            <input value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} className="min-h-[44px] rounded-[12px] border border-app-line bg-white px-3 text-[14px] font-normal outline-none focus:border-app-ink" />
          </label>
          <div className="flex gap-2">
            <PillButton size="sm" busy={pending && busy === "decline"} onClick={() => act("decline", () => declineImportQuote(id, reason), () => setDeclining(false))}>{labels.declineSend}</PillButton>
            <PillButton size="sm" tone="ghost" onClick={() => setDeclining(false)}>{labels.keep}</PillButton>
          </div>
        </div>
      ) : null}
      {error ? <p role="alert" className="m-0 text-[13.5px] font-bold text-app-danger">{error}</p> : null}
    </div>
  );
}
