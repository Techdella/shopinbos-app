"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldLabel, Notice, PillButton, TextInput } from "@/components/app-ui";
import { confirmDialog } from "@/components/ui/dialogs";
import { useT } from "@/components/i18n/I18nProvider";

// "My riders": the seller's own delivery riders. Adding one (or asking for a new link) shows their private Riders
// app link once, to send on WhatsApp: only its hash is kept, so it can't be shown again.

export interface FleetRider {
  id: string;
  name: string;
  phone: string | null;
  online: boolean;
  hasLink: boolean;
  openJobs: number;
}

type Link = { url: string; riderName: string; whatsapp: string | null };

export function MyRiders({ riders, storeName, limit, api = "/api/app/logistics" }: { riders: FleetRider[]; storeName: string; limit?: number; api?: string }) {
  const t = useT("shipping", "common");
  const router = useRouter();
  const [adding, setAdding] = useState(riders.length === 0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [link, setLink] = useState<Link | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, init: RequestInit) {
    const res = await fetch(url, init).catch(() => null);
    const json = res ? ((await res.json().catch(() => null)) as { data?: unknown; error?: { message?: string } } | null) : null;
    if (!res?.ok) throw new Error(json?.error?.message ?? t("fleet.failed"));
    return json?.data;
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy("add");
    setError(null);
    try {
      const data = (await call(`${api}/my-riders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, phone }) })) as Link;
      setLink(data);
      setCopied(false);
      setName("");
      setPhone("");
      setAdding(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("fleet.failed"));
    } finally {
      setBusy(null);
    }
  }

  async function newLink(rider: FleetRider) {
    if (rider.hasLink && !(await confirmDialog(t("fleet.newLinkConfirm", { name: rider.name })))) return;
    setBusy(rider.id);
    setError(null);
    try {
      setLink((await call(`${api}/my-riders/${encodeURIComponent(rider.id)}/link`, { method: "POST" })) as Link);
      setCopied(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("fleet.failed"));
    } finally {
      setBusy(null);
    }
  }

  async function remove(rider: FleetRider) {
    if (!(await confirmDialog(t("fleet.removeConfirm", { name: rider.name })))) return;
    setBusy(rider.id);
    setError(null);
    try {
      await call(`${api}/my-riders/${encodeURIComponent(rider.id)}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("fleet.failed"));
    } finally {
      setBusy(null);
    }
  }

  async function copy(text: string) {
    await navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => null);
  }

  const shareText = link ? t("fleet.linkMessage", { name: link.riderName, store: storeName, url: link.url }) : "";

  return (
    <div className="grid gap-3">
      {link && (
        <div className="grid gap-2 rounded-[16px] border border-app-line bg-app-canvas px-4 py-3">
          <div className="text-[14px] font-extrabold">{t("fleet.linkReady", { name: link.riderName })}</div>
          <div className="break-all font-mono text-[12.5px] text-app-ink-soft">{link.url}</div>
          <div className="text-[12.5px] text-app-ink-soft">{t("fleet.linkOnce")}</div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://wa.me/${link.whatsapp ?? ""}?text=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[38px] items-center rounded-full bg-app-forest px-4 text-[13px] font-bold text-white"
            >
              {t("fleet.sendWhatsApp")}
            </a>
            <PillButton tone="white" size="sm" onClick={() => copy(shareText)}>{copied ? t("fleet.copied") : t("fleet.copy")}</PillButton>
            <PillButton tone="ghost" size="sm" onClick={() => setLink(null)}>{t("fleet.done")}</PillButton>
          </div>
        </div>
      )}

      {riders.length > 0 && (
        <ul className="m-0 grid list-none gap-2 p-0">
          {riders.map((rider) => (
            <li key={rider.id} className="flex flex-wrap items-center gap-3 rounded-[16px] border border-app-line bg-white px-4 py-3">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${rider.online ? "bg-app-success" : "bg-app-line-strong"}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-extrabold">{rider.name}</div>
                <div className="truncate text-[12.5px] text-app-ink-soft">
                  {[rider.phone, rider.online ? t("fleet.online") : t("fleet.offline"), rider.openJobs ? t("fleet.openJobs", { count: rider.openJobs }) : null].filter(Boolean).join(" · ")}
                </div>
              </div>
              <PillButton tone="white" size="sm" busy={busy === rider.id} disabled={Boolean(busy)} onClick={() => newLink(rider)}>
                {rider.hasLink ? t("fleet.newLink") : t("fleet.getLink")}
              </PillButton>
              <PillButton tone="ghost" size="sm" disabled={Boolean(busy)} onClick={() => remove(rider)}>{t("fleet.remove")}</PillButton>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form onSubmit={add} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <div className="min-w-0">
              <FieldLabel htmlFor="fleet-name">{t("fleet.riderName")}</FieldLabel>
              <TextInput id="fleet-name" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="min-w-0">
              <FieldLabel htmlFor="fleet-phone">{t("fleet.riderPhone")}</FieldLabel>
              <TextInput id="fleet-phone" required type="tel" inputMode="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803 123 4567" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <PillButton type="submit" tone="ink" size="sm" busy={busy === "add"}>{t("fleet.addAndLink")}</PillButton>
            {riders.length > 0 && <PillButton tone="ghost" size="sm" onClick={() => setAdding(false)}>{t("cancel")}</PillButton>}
          </div>
        </form>
      ) : (
        <PillButton tone="white" size="sm" onClick={() => { setAdding(true); setError(null); }}>{t("fleet.add")}</PillButton>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      {limit !== undefined && <p className="m-0 text-[12.5px] font-bold text-app-ink-soft">{t("fleet.planLimit", { count: riders.length, limit })}</p>}
      <p className="m-0 text-[12.5px] leading-5 text-app-ink-soft">{t("fleet.note")}</p>
    </div>
  );
}
