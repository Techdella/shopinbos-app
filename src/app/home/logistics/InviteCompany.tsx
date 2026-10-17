"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldLabel, Notice, PillButton, TextInput } from "@/components/app-ui";
import { useT } from "@/components/i18n/I18nProvider";

// Invite the delivery company the seller already uses: a link to send them on WhatsApp. Once they sign up and
// accept, they're the seller's delivery company on Shopinbos.

export interface InviteRow {
  id: string;
  companyName: string;
  status: string;
  url: string;
  partner: { displayName: string; verificationStatus: string; status: string } | null;
}

export function InviteCompany({ invites }: { invites: InviteRow[] }) {
  const t = useT("shipping", "common");
  const router = useRouter();
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [made, setMade] = useState<{ url: string; message: string; whatsapp: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setBusy("new");
    setError(null);
    const res = await fetch("/api/app/logistics/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyName: company.trim(), contact: contact.trim() || undefined }),
    }).catch(() => null);
    const json = res ? ((await res.json().catch(() => null)) as { data?: { url: string; message: string; whatsapp: string | null }; error?: { message?: string } } | null) : null;
    setBusy(null);
    if (!res?.ok || !json?.data) return setError(json?.error?.message ?? t("fleet.failed"));
    setMade(json.data);
    setCopied(false);
    setCompany("");
    setContact("");
    router.refresh();
  }

  async function cancel(id: string) {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/app/logistics/invites/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return setError(t("fleet.failed"));
    router.refresh();
  }

  const statusOf = (row: InviteRow) => {
    if (row.status === "pending") return t("invite.waiting");
    if (!row.partner) return t("invite.accepted");
    return row.partner.verificationStatus === "verified" && row.partner.status === "active" ? t("invite.ready") : t("invite.checking");
  };

  return (
    <div className="grid gap-3">
      <form onSubmit={invite} className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <div className="min-w-0">
            <FieldLabel htmlFor="inv-company">{t("invite.company")}</FieldLabel>
            <TextInput id="inv-company" required minLength={2} maxLength={120} value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div className="min-w-0">
            <FieldLabel htmlFor="inv-contact">{t("invite.contact")}</FieldLabel>
            <TextInput id="inv-contact" maxLength={120} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="0803 123 4567" />
          </div>
        </div>
        <PillButton type="submit" tone="ink" size="sm" busy={busy === "new"}>{t("invite.create")}</PillButton>
      </form>

      {made && (
        <div className="grid gap-2 rounded-[16px] border border-app-line bg-app-canvas px-4 py-3">
          <div className="text-[14px] font-extrabold">{t("invite.linkReady")}</div>
          <div className="break-all font-mono text-[12.5px] text-app-ink-soft">{made.url}</div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://wa.me/${made.whatsapp ?? ""}?text=${encodeURIComponent(made.message)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[38px] items-center rounded-full bg-app-forest px-4 text-[13px] font-bold text-white"
            >
              {t("fleet.sendWhatsApp")}
            </a>
            <PillButton tone="white" size="sm" onClick={() => navigator.clipboard?.writeText(made.message).then(() => setCopied(true)).catch(() => null)}>
              {copied ? t("fleet.copied") : t("fleet.copy")}
            </PillButton>
          </div>
        </div>
      )}

      {invites.length > 0 && (
        <ul className="m-0 grid list-none gap-2 p-0">
          {invites.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 rounded-[16px] border border-app-line bg-white px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-extrabold">{row.partner?.displayName ?? row.companyName}</div>
                <div className="truncate text-[12.5px] text-app-ink-soft">{statusOf(row)}</div>
              </div>
              {row.status === "pending" && (
                <PillButton tone="ghost" size="sm" busy={busy === row.id} disabled={Boolean(busy)} onClick={() => cancel(row.id)}>{t("invite.cancel")}</PillButton>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      <p className="m-0 text-[12.5px] leading-5 text-app-ink-soft">{t("invite.note")}</p>
    </div>
  );
}
