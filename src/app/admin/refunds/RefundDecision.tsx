"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClass, fieldClass } from "@/components/admin/AdminKit";
import { decideRefundAction } from "./actions";

// The team's decision on a refund: it arrived, the seller sends it again, or it's closed (settled outside the app).

export function RefundDecision({ refundId }: { refundId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const decide = (decision: "received" | "resend" | "cancel") =>
    start(async () => {
      setError(null);
      const result = await decideRefundAction(refundId, decision, note);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  return (
    <div className="grid gap-2 border-t border-app-line pt-3">
      <textarea className={`${fieldClass} min-h-[56px] py-2`} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What you found (the seller sees it)" />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} className={buttonClass("ink", "sm")} onClick={() => decide("received")}>It arrived</button>
        <button type="button" disabled={pending} className={buttonClass("white", "sm")} onClick={() => decide("resend")}>Seller sends it again</button>
        <button type="button" disabled={pending} className={buttonClass("danger", "sm")} onClick={() => decide("cancel")}>Close it</button>
      </div>
      {error ? <p role="alert" className="m-0 text-[13px] font-bold text-app-danger">{error}</p> : null}
    </div>
  );
}
