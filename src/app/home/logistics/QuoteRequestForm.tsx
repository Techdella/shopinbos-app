"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldLabel, Notice, PillButton, TextInput } from "@/components/app-ui";
import { useT } from "@/components/i18n/I18nProvider";

interface PartnerOption {
  id: string;
  name: string;
}

export function QuoteRequestForm({ partners, defaultPartnerId, defaultPickup }: { partners: PartnerOption[]; defaultPartnerId?: string; defaultPickup?: string }) {
  const t = useT("shipping", "common");
  const router = useRouter();
  const [partnerId, setPartnerId] = useState(defaultPartnerId && partners.some((p) => p.id === defaultPartnerId) ? defaultPartnerId : partners[0]?.id ?? "");
  const [pickup, setPickup] = useState(defaultPickup ?? "");
  const [destination, setDestination] = useState("");
  const [weight, setWeight] = useState("");
  const [description, setDescription] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [fragile, setFragile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/app/logistics/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logisticsPartnerId: partnerId,
          pickupLocation: pickup.trim(),
          destination: destination.trim(),
          packageDetails: {
            weight: weight ? Number(weight) : undefined,
            fragile,
            description: description.trim() || undefined,
          },
          preferredDate: preferredDate || undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) throw new Error(json?.error?.message ?? t("qf.sendFailed"));
      setResult({ tone: "success", text: t("qf.sent") });
      setDestination("");
      setWeight("");
      setDescription("");
      setPreferredDate("");
      setFragile(false);
      router.refresh();
    } catch (err) {
      setResult({ tone: "error", text: err instanceof Error ? err.message : t("qf.sendFailed") });
    } finally {
      setBusy(false);
    }
  }

  if (!partners.length) {
    return <p className="m-0 text-[14px] text-app-ink-soft">{t("qf.noPartners")}</p>;
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div>
        <FieldLabel htmlFor="q-partner">{t("qf.partner")}</FieldLabel>
        <select
          id="q-partner"
          value={partnerId}
          onChange={(e) => setPartnerId(e.target.value)}
          className="h-[54px] w-full rounded-[16px] border border-app-line bg-white px-4 text-[15px] text-app-ink outline-none focus:border-app-ink"
        >
          {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <div className="min-w-0">
          <FieldLabel htmlFor="q-pickup">{t("qf.pickup")}</FieldLabel>
          <TextInput id="q-pickup" required minLength={2} maxLength={300} value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder={t("qf.pickupPlaceholder")} />
        </div>
        <div className="min-w-0">
          <FieldLabel htmlFor="q-dest">{t("qf.dest")}</FieldLabel>
          <TextInput id="q-dest" required minLength={2} maxLength={300} value={destination} onChange={(e) => setDestination(e.target.value)} placeholder={t("qf.destPlaceholder")} />
        </div>
        <div className="min-w-0">
          <FieldLabel htmlFor="q-weight">{t("qf.weight")}</FieldLabel>
          <TextInput id="q-weight" type="number" inputMode="decimal" min={0} step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
        <div className="min-w-0">
          <FieldLabel htmlFor="q-date">{t("qf.date")}</FieldLabel>
          <TextInput id="q-date" type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} />
        </div>
      </div>
      <div>
        <FieldLabel htmlFor="q-desc">{t("qf.desc")}</FieldLabel>
        <TextInput id="q-desc" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("qf.descPlaceholder")} />
      </div>
      <label className="flex min-h-[40px] cursor-pointer items-center gap-3 text-[14px] font-bold">
        <input type="checkbox" checked={fragile} onChange={(e) => setFragile(e.target.checked)} className="h-5 w-5 accent-[#16141F]" />
        {t("qf.fragile")}
      </label>
      {result && <Notice tone={result.tone}>{result.text}</Notice>}
      <PillButton type="submit" tone="accent" size="md" busy={busy} disabled={!partnerId}>{t("qf.submit")}</PillButton>
    </form>
  );
}
