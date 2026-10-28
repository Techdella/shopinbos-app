"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Field, buttonClass, fieldClass } from "@/components/admin/AdminKit";
import { DEFAULT_TIER_RULES, type TierRules } from "@shared/partner-tiers";
import { friendlyError } from "@/lib/errors/report-client";

export function TierRulesForm({ initial }: { initial: TierRules }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").replace(/[₦,%\s]/g, "");
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/logistics-partners/tier-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxOrderValue: value("maxOrderValue"),
          maxActiveOrders: value("maxActiveOrders"),
          graduation: { minDeliveries: value("minDeliveries"), minRating: value("minRating"), maxDisputeRate: value("maxDisputeRate") },
          note: String(form.get("note") ?? "").trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error?.message ?? "Couldn't save the rules.");
      setMessage({ text: "Saved.", error: false });
      router.refresh();
    } catch (err) {
      setMessage({ text: err instanceof Error ? friendlyError(err) : "Couldn't save the rules.", error: true });
    } finally {
      setBusy(false);
    }
  }

  const d = DEFAULT_TIER_RULES;
  return (
    <form onSubmit={submit} className="mt-4 grid gap-4">
      <fieldset className="m-0 grid gap-3 border-0 p-0 sm:grid-cols-2">
        <legend className="mb-2 text-[14px] font-extrabold">Safety limits for new partners (no CAC)</legend>
        <Field label="Max order value per delivery (₦)" htmlFor="maxOrderValue" hint={`Default ₦${d.maxOrderValue.toLocaleString("en-NG")}`}>
          <input id="maxOrderValue" name="maxOrderValue" inputMode="numeric" required defaultValue={initial.maxOrderValue} className={fieldClass} />
        </Field>
        <Field label="Max open jobs at once" htmlFor="maxActiveOrders" hint={`Default ${d.maxActiveOrders}`}>
          <input id="maxActiveOrders" name="maxActiveOrders" type="number" min={1} required defaultValue={initial.maxActiveOrders} className={fieldClass} />
        </Field>
      </fieldset>
      <fieldset className="m-0 grid gap-3 border-0 p-0 sm:grid-cols-3">
        <legend className="mb-2 text-[14px] font-extrabold">Safety limits lift when all three are met</legend>
        <Field label="Completed deliveries at least" htmlFor="minDeliveries" hint={`Default ${d.graduation.minDeliveries}`}>
          <input id="minDeliveries" name="minDeliveries" type="number" min={0} required defaultValue={initial.graduation.minDeliveries} className={fieldClass} />
        </Field>
        <Field label="Average rating at least" htmlFor="minRating" hint={`Default ${d.graduation.minRating.toFixed(1)}`}>
          <input id="minRating" name="minRating" type="number" min={0} max={5} step={0.1} required defaultValue={initial.graduation.minRating} className={fieldClass} />
        </Field>
        <Field label="Disputes / failed at most (%)" htmlFor="maxDisputeRate" hint={`Default ${d.graduation.maxDisputeRate}%`}>
          <input id="maxDisputeRate" name="maxDisputeRate" type="number" min={0} max={100} step={0.1} required defaultValue={initial.graduation.maxDisputeRate} className={fieldClass} />
        </Field>
      </fieldset>
      <Field label="Why the change (optional)" htmlFor="note">
        <input id="note" name="note" maxLength={300} className={fieldClass} placeholder="e.g. Raising the order limit for December" />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className={buttonClass("ink")}>{busy ? "Saving…" : "Save rules"}</button>
        {message && <span role="status" className={`text-[14px] font-bold ${message.error ? "text-app-danger" : "text-app-success"}`}>{message.text}</span>}
      </div>
    </form>
  );
}
