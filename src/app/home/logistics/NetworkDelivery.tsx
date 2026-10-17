"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldLabel, Notice, PillButton, TextInput } from "@/components/app-ui";
import { confirmDialog } from "@/components/ui/dialogs";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatMoney } from "@shared/i18n";

// Delivery networks (Kwik, Fez, …): compare their live prices for one delivery and book one. Each price is the
// network's own; on Shopinbos's account the Shopinbos fee is a separate line and the seller pays before it's
// booked. On the seller's own connected account it's booked at once and paid to the network directly.

export interface NetworkOption {
  id: string;
  name: string;
  via: "own" | "shopinbos" | null;
}

// name is whoever set the price; for an aggregator (Shipbubble) that's the courier, and networkName the network.
type Offer =
  | { network: string; option?: string; name: string; networkName: string; eta?: string | null; ok: true; via: "own" | "shopinbos"; price: number; fee: number; total: number; currency: string }
  | { network: string; option?: string; name: string; networkName: string; ok: false; error: string };

const offerKey = (offer: { network: string; option?: string }) => (offer.option ? `${offer.network}:${offer.option}` : offer.network);

export function NetworkDelivery({ networks, defaultPickup, orderId }: { networks: NetworkOption[]; defaultPickup?: string; orderId?: string }) {
  const t = useT("shipping", "common");
  const locale = useLocale();
  const router = useRouter();
  const money = (n: number) => formatMoney(n, locale, { decimals: n % 1 ? 2 : 0 });
  const [pickup, setPickup] = useState(defaultPickup ?? "");
  const [destination, setDestination] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [weight, setWeight] = useState("");
  const [description, setDescription] = useState("");
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);

  const request = () => ({
    pickupLocation: pickup.trim(),
    destination: destination.trim(),
    recipient: name.trim() && phone.trim() ? { name: name.trim(), phone: phone.trim() } : undefined,
    weightKg: weight ? Number(weight) : undefined,
    description: description.trim() || undefined,
    ...(orderId ? { orderId } : {}),
  });

  async function compare(event: React.FormEvent) {
    event.preventDefault();
    setBusy("compare");
    setMessage(null);
    setOffers(null);
    try {
      const res = await fetch("/api/app/logistics/networks/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request()) });
      const json = (await res.json().catch(() => null)) as { data?: { offers: Offer[] }; error?: { message?: string } } | null;
      if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? t("net.compareFailed"));
      setOffers(json.data.offers);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : t("net.compareFailed") });
    } finally {
      setBusy(null);
    }
  }

  async function book(offer: Extract<Offer, { ok: true }>) {
    setBusy(offerKey(offer));
    setMessage(null);
    try {
      const res = await fetch("/api/app/logistics/networks/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network: offer.network, ...(offer.option ? { option: offer.option } : {}), request: request(), expectedPrice: offer.price }),
      });
      const json = (await res.json().catch(() => null)) as { data?: { kind: "pay"; authorizationUrl: string } | { kind: "booked" }; error?: { message?: string } } | null;
      if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? t("net.bookFailed"));
      if (json.data.kind === "pay") {
        window.location.assign(json.data.authorizationUrl);
        return;
      }
      setMessage({ tone: "success", text: t("net.booked", { network: offer.name }) });
      setOffers(null);
      setDestination("");
      setName("");
      setPhone("");
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : t("net.bookFailed") });
    } finally {
      setBusy(null);
    }
  }

  if (!networks.length) return <p className="m-0 text-[14px] text-app-ink-soft">{t("net.none")}</p>;

  return (
    <div className="grid gap-4">
      <form onSubmit={compare} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <FieldLabel htmlFor="n-pickup">{t("qf.pickup")}</FieldLabel>
            <TextInput id="n-pickup" required minLength={5} maxLength={300} value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder={t("net.addressPlaceholder")} />
          </div>
          <div className="min-w-0">
            <FieldLabel htmlFor="n-dest">{t("qf.dest")}</FieldLabel>
            <TextInput id="n-dest" required minLength={5} maxLength={300} value={destination} onChange={(e) => setDestination(e.target.value)} placeholder={t("net.addressPlaceholder")} />
          </div>
          <div className="min-w-0">
            <FieldLabel htmlFor="n-name">{t("net.customerName")}</FieldLabel>
            <TextInput id="n-name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="min-w-0">
            <FieldLabel htmlFor="n-phone">{t("net.customerPhone")}</FieldLabel>
            <TextInput id="n-phone" type="tel" inputMode="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803 123 4567" />
          </div>
          <div className="min-w-0">
            <FieldLabel htmlFor="n-weight">{t("qf.weight")}</FieldLabel>
            <TextInput id="n-weight" type="number" inputMode="decimal" min={0} step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
          <div className="min-w-0">
            <FieldLabel htmlFor="n-desc">{t("qf.desc")}</FieldLabel>
            <TextInput id="n-desc" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("qf.descPlaceholder")} />
          </div>
        </div>
        <PillButton type="submit" tone="ink" size="md" busy={busy === "compare"} disabled={Boolean(busy)}>{t("net.compare")}</PillButton>
      </form>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {offers && (
        <ul className="m-0 grid list-none gap-3 p-0">
          {offers.map((offer) => (
            <li key={offerKey(offer)} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[18px] border border-app-line bg-white px-4 py-3.5">
              <div className="min-w-0 flex-1 basis-[200px]">
                <div className="text-[15px] font-extrabold">{offer.name}</div>
                {offer.ok ? (
                  <div className="text-[12.5px] text-app-ink-soft">
                    {t("net.priceSetBy", { network: offer.name })}
                    {offer.networkName !== offer.name ? ` · ${t("net.via", { network: offer.networkName })}` : ""}
                    {offer.eta ? ` · ${offer.eta}` : ""}
                    {offer.via === "own" ? ` · ${t("net.yourAccount")}` : ""}
                  </div>
                ) : (
                  <div className="text-[12.5px] text-app-ink-soft">{offer.error}</div>
                )}
              </div>
              {offer.ok && (
                <>
                  <div className="shrink-0 text-right text-[13px] leading-5">
                    <div>{t("net.networkPrice", { network: offer.name })} <b>{money(offer.price)}</b></div>
                    {offer.via === "shopinbos" ? <div className="text-app-ink-soft">{t("net.fee")} {money(offer.fee)}</div> : <div className="text-app-ink-soft">{t("net.payNetwork", { network: offer.name })}</div>}
                    <div className="text-[15px] font-extrabold">{money(offer.total)}</div>
                  </div>
                  <PillButton tone="accent" size="sm" busy={busy === offerKey(offer)} disabled={Boolean(busy)} onClick={() => book(offer)}>
                    {offer.via === "shopinbos" ? t("net.payAndBook") : t("net.book")}
                  </PillButton>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="m-0 text-[12.5px] leading-5 text-app-ink-soft">{t("net.disclaimer")}</p>
    </div>
  );
}

/** Cancels a network delivery before pickup (and refunds it when it was paid through Shopinbos). */
export function CancelNetworkBooking({ bookingId }: { bookingId: string }) {
  const t = useT("shipping", "common");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function cancel() {
    if (!(await confirmDialog(t("net.cancelConfirm")))) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/app/logistics/bookings/${encodeURIComponent(bookingId)}/cancel`, { method: "POST" }).catch(() => null);
    const json = res ? ((await res.json().catch(() => null)) as { error?: { message?: string } } | null) : null;
    setBusy(false);
    if (!res?.ok) return setError(json?.error?.message ?? t("net.cancelFailed"));
    router.refresh();
  }
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <PillButton tone="white" size="sm" busy={busy} onClick={cancel}>{t("net.cancel")}</PillButton>
      {error && <span className="max-w-[220px] text-right text-[12px] text-app-danger">{error}</span>}
    </span>
  );
}
