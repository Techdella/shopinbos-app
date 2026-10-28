"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearSupplierReviewAction } from "@/app/actions/faults";
import { buttonClass, fieldClass } from "@/components/admin/AdminKit";

// A supplier with 3 strikes in 90 days (shared/fault-matrix.ts): the team looks and writes what they decided (a
// word with them, a level change, a pause). Never an automatic suspension; new strikes can raise the flag again.
export function SupplierReviewDone({ supplierId }: { supplierId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-2 border-t border-app-line pt-3">
      <textarea className={`${fieldClass} min-h-[56px] py-2`} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What you decided (spoke to them, changed their level, paused them…)" />
      {error ? <p role="alert" className="m-0 text-[13px] font-bold text-app-danger">{error}</p> : null}
      <div>
        <button type="button" className={buttonClass("ink", "sm")} disabled={pending} onClick={() => start(async () => {
          const result = await clearSupplierReviewAction(supplierId, note);
          if (!result.ok) setError(result.error);
          router.refresh();
        })}>{pending ? "Saving…" : "Reviewed"}</button>
      </div>
    </div>
  );
}
