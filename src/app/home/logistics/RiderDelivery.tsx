"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldLabel, Notice, PillButton, TextInput } from "@/components/app-ui";
import { confirmDialog } from "@/components/ui/dialogs";
import { useT } from "@/components/i18n/I18nProvider";

// Giving a delivery to one of the seller's own riders (free, no Shopinbos fee), then a ready WhatsApp message for
// the rider. FleetJobActions lets the seller move it by hand for a rider without a smartphone.

export function RiderDelivery({ riders, defaultPickup, orderId }: { riders: Array<{ id: string; name: string }>; defaultPickup?: string; orderId?: string }) {
  const t = useT("shipping", "common");
  const router = useRouter();
  const [riderId, setRiderId] = useState(riders[0]?.id ?? "");
  const [pickup, setPickup] = useState(defaultPickup ?? "");
  const [destination, setDestination] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ rider: string; whatsapp: string | null; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSent(null);
    const res = await fetch("/api/app/logistics/my-riders/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        riderId,
        pickupLocation: pickup.trim(),
        destination: destination.trim(),
        recipient: name.trim() && phone.trim() ? { name: name.trim(), phone: phone.trim() } : undefined,
        notes: notes.trim() || undefined,
        ...(orderId ? { orderId } : {}),
      }),
    }).catch(() => null);
    const json = res ? ((await res.json().catch(() => null)) as { data?: { whatsapp: string | null; message: string }; error?: { message?: string } } | null) : null;
    setBusy(false);
    if (!res?.ok || !json?.data) return setError(json?.error?.message ?? t("fleet.failed"));
    setSent({ rider: riders.find((r) => r.id === riderId)?.name ?? "", whatsapp: json.data.whatsapp, message: json.data.message });
    setDestination("");
    setName("");
    setPhone("");
    setNotes("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 sm:col-span-2">
          <FieldLabel htmlFor="rd-rider">{t("fleet.pickRider")}</FieldLabel>
          <select
            id="rd-rider"
            value={riderId}
            onChange={(e) => setRiderId(e.target.value)}
            className="h-[54px] w-full rounded-[16px] border border-app-line bg-white px-4 text-[15px] text-app-ink outline-none focus:border-app-ink"
          >
            {riders.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="min-w-0">
          <FieldLabel htmlFor="rd-pickup">{t("qf.pickup")}</FieldLabel>
          <TextInput id="rd-pickup" required minLength={3} maxLength={300} value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder={t("net.addressPlaceholder")} />
        </div>
        <div className="min-w-0">
          <FieldLabel htmlFor="rd-dest">{t("qf.dest")}</FieldLabel>
          <TextInput id="rd-dest" required minLength={3} maxLength={300} value={destination} onChange={(e) => setDestination(e.target.value)} placeholder={t("net.addressPlaceholder")} />
        </div>
        <div className="min-w-0">
          <FieldLabel htmlFor="rd-name">{t("net.customerName")}</FieldLabel>
          <TextInput id="rd-name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="min-w-0">
          <FieldLabel htmlFor="rd-phone">{t("net.customerPhone")}</FieldLabel>
          <TextInput id="rd-phone" type="tel" inputMode="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803 123 4567" />
        </div>
        <div className="min-w-0 sm:col-span-2">
          <FieldLabel htmlFor="rd-notes">{t("fleet.notes")}</FieldLabel>
          <TextInput id="rd-notes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("fleet.notesPlaceholder")} />
        </div>
      </div>
      <PillButton type="submit" tone="ink" size="md" busy={busy} disabled={!riderId}>{t("fleet.give")}</PillButton>
      {error && <Notice tone="error">{error}</Notice>}
      {sent && (
        <div className="grid gap-2 rounded-[16px] border border-app-line bg-app-canvas px-4 py-3">
          <div className="text-[14px] font-extrabold">{t("fleet.given", { name: sent.rider })}</div>
          <a
            href={`https://wa.me/${sent.whatsapp ?? ""}?text=${encodeURIComponent(sent.message)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[38px] w-fit items-center rounded-full bg-app-forest px-4 text-[13px] font-bold text-white"
          >
            {t("fleet.tellRider", { name: sent.rider })}
          </a>
        </div>
      )}
    </form>
  );
}

/** Picked up / delivered / failed for a delivery with the seller's own rider. */
export function FleetJobActions({ bookingId, status }: { bookingId: string; status: string }) {
  const t = useT("shipping", "common");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function move(to: "picked_up" | "delivered" | "failed") {
    if (to !== "picked_up" && !(await confirmDialog(t(to === "delivered" ? "fleet.deliveredConfirm" : "fleet.failedConfirm")))) return;
    setBusy(to);
    setError(null);
    const res = await fetch(`/api/app/logistics/my-riders/jobs/${encodeURIComponent(bookingId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to }) }).catch(() => null);
    const json = res ? ((await res.json().catch(() => null)) as { error?: { message?: string } } | null) : null;
    setBusy(null);
    if (!res?.ok) return setError(json?.error?.message ?? t("fleet.failed"));
    router.refresh();
  }
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
      {status === "confirmed" && <PillButton tone="white" size="sm" busy={busy === "picked_up"} disabled={Boolean(busy)} onClick={() => move("picked_up")}>{t("fleet.markPicked")}</PillButton>}
      <PillButton tone="white" size="sm" busy={busy === "delivered"} disabled={Boolean(busy)} onClick={() => move("delivered")}>{t("fleet.markDelivered")}</PillButton>
      <PillButton tone="ghost" size="sm" busy={busy === "failed"} disabled={Boolean(busy)} onClick={() => move("failed")}>{t("fleet.markFailed")}</PillButton>
      {error && <span className="basis-full text-right text-[12px] text-app-danger">{error}</span>}
    </span>
  );
}
