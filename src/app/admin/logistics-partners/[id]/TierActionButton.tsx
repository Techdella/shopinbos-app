"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmDialog, promptDialog } from "@/components/ui/dialogs";
import { buttonClass } from "@/components/admin/AdminKit";
import { friendlyError } from "@/lib/errors/report-client";

// One admin decision on the tier panel: PATCHes `url` with `body`, asking for a reason first when `reason` is set
// (the partner sees it), or for a yes when `confirm` is set. Refreshes the page after.
export function TierActionButton({
  url,
  body,
  label,
  tone = "ink",
  reason,
  confirm,
}: {
  url: string;
  body: Record<string, unknown>;
  label: string;
  tone?: "ink" | "white" | "danger";
  /** Ask for a reason, sent as body[key ?? "reason"]. */
  reason?: { title: string; message?: string; key?: string };
  confirm?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    let payload = body;
    if (reason) {
      const typed = await promptDialog({ title: reason.title, message: reason.message ?? "The partner sees this, so say what to fix.", placeholder: "Reason", multiline: true, confirmLabel: label, tone: "danger" });
      if (typed === null) return;
      if (typed.trim().length < 3) { setError("Give a reason the partner can act on."); return; }
      payload = { ...body, [reason.key ?? "reason"]: typed.trim() };
    } else if (confirm && !(await confirmDialog({ title: confirm, confirmLabel: label }))) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : data.error?.message ?? "That didn't save. Try again.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err) : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={run} disabled={busy} className={buttonClass(tone, "sm")}>{busy ? "Saving…" : label}</button>
      {error && <span role="alert" className="text-[12.5px] font-bold text-app-danger">{error}</span>}
    </span>
  );
}
