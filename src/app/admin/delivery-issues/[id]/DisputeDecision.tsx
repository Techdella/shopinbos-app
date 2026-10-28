"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideDisputeAction } from "@/app/actions/faults";
import { buttonClass, fieldClass } from "@/components/admin/AdminKit";

// The team picks the outcome from the matrix (the one the evidence points to comes pre-selected; the page above
// shows what each choice means for everyone) and confirms with a reason both businesses see. "Nobody owes" closes
// the report. Choosing an event or remedy reloads the preview (?event=&remedy=&part=).

export function DisputeDecision({ issueId, events, selected, remedy, replaceable, parts, part }: {
  issueId: string;
  events: Array<{ event: string; label: string }>;
  selected: string;
  remedy: string;
  replaceable: boolean;
  parts: Array<{ key: string; label: string }>;
  part: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = (next: { event?: string; remedy?: string; part?: string }) => {
    const params = new URLSearchParams({ event: next.event ?? selected, remedy: next.remedy ?? remedy, part: next.part ?? part });
    router.replace(`/admin/delivery-issues/${issueId}?${params.toString()}`, { scroll: false });
  };
  function confirm() {
    setError(null);
    start(async () => {
      const result = await decideDisputeAction(issueId, { event: selected === "none" ? "" : selected, remedy, partKeys: part === "all" ? [] : [part], note });
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }
  return (
    <div className="grid gap-3" data-testid="dispute-decision">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="grid gap-1 text-[12.5px] font-bold">What happened
          <select className={fieldClass} value={selected} onChange={(event) => go({ event: event.target.value })}>
            {events.map((row) => <option key={row.event} value={row.event}>{row.label}</option>)}
            <option value="none">Nobody owes anything</option>
          </select>
        </label>
        <label className="grid gap-1 text-[12.5px] font-bold">For the customer
          <select className={fieldClass} value={replaceable ? remedy : "refund"} disabled={!replaceable} onChange={(event) => go({ remedy: event.target.value })}>
            <option value="refund">Refund</option>
            <option value="replacement">Replacement</option>
          </select>
        </label>
        <label className="grid gap-1 text-[12.5px] font-bold">Which parcel
          <select className={fieldClass} value={part} onChange={(event) => go({ part: event.target.value })}>
            {parts.length > 1 ? <option value="all">The whole order</option> : null}
            {parts.map((row) => <option key={row.key} value={row.key}>{row.label}</option>)}
          </select>
        </label>
      </div>
      <textarea className={`${fieldClass} min-h-[64px] py-2`} value={note} onChange={(event) => setNote(event.target.value)} placeholder="The reason for the decision (the shop, supplier and partner see it)" />
      {error ? <p role="alert" className="m-0 rounded-[12px] bg-app-danger-tint px-3 py-2 text-[13.5px] font-bold text-app-danger">{error}</p> : null}
      <div><button type="button" className={buttonClass("ink")} disabled={pending} onClick={confirm}>{pending ? "Applying…" : "Confirm this outcome"}</button></div>
      <p className="m-0 text-[12.5px] text-app-ink-soft">Money moves only through the customer&apos;s refund and money owed, taken from the at-fault business&apos;s next payments.</p>
    </div>
  );
}
