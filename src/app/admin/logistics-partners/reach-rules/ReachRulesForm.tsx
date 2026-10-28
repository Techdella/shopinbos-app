"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Field, buttonClass, fieldClass } from "@/components/admin/AdminKit";
import { DEFAULT_HIGH_VALUE_RULES, type HighValueRules } from "@shared/partner-reach";
import { friendlyError } from "@/lib/errors/report-client";

// The high-value parcel rules (PlatformSetting "logistics.high_value"): the order value over which a parcel is
// high-value, the product types that always are, and words in a product's name that are (laptops have no type).
export function ReachRulesForm({ initial, types }: { initial: HighValueRules; types: Array<{ key: string; label: string }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/logistics-partners/reach-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minOrderValue: String(form.get("minOrderValue") ?? "").replace(/[₦,\s]/g, ""),
          productTypes: form.getAll("productTypes").map(String),
          keywords: String(form.get("keywords") ?? "").split(/[,\n]/).map((word) => word.trim()).filter(Boolean),
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

  const d = DEFAULT_HIGH_VALUE_RULES;
  return (
    <form onSubmit={submit} className="mt-4 grid gap-4">
      <Field label="High-value when the order is worth more than (₦)" htmlFor="minOrderValue" hint={`Default ₦${d.minOrderValue.toLocaleString("en-NG")}`}>
        <input id="minOrderValue" name="minOrderValue" inputMode="numeric" required defaultValue={initial.minOrderValue} className={fieldClass} />
      </Field>
      <fieldset className="m-0 grid gap-2 border-0 p-0">
        <legend className="mb-2 text-[14px] font-extrabold">Product types that are always high-value</legend>
        <div className="flex flex-wrap gap-2">
          {types.map((type) => (
            <label key={type.key} className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full border border-app-line bg-white px-3 text-[13.5px] font-bold has-[:checked]:border-app-forest has-[:checked]:bg-app-mint">
              <input type="checkbox" name="productTypes" value={type.key} defaultChecked={initial.productTypes.includes(type.key)} />
              {type.label}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Words in a product's name that make it high-value" htmlFor="keywords" hint={`Comma-separated. Default: ${d.keywords.join(", ")}`}>
        <textarea id="keywords" name="keywords" rows={2} defaultValue={initial.keywords.join(", ")} className={fieldClass} />
      </Field>
      <Field label="Why the change (optional)" htmlFor="note">
        <input id="note" name="note" maxLength={300} className={fieldClass} placeholder="e.g. Adding cameras for December" />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className={buttonClass("ink")}>{busy ? "Saving…" : "Save rules"}</button>
        {message && <span role="status" className={`text-[14px] font-bold ${message.error ? "text-app-danger" : "text-app-success"}`}>{message.text}</span>}
      </div>
    </form>
  );
}
