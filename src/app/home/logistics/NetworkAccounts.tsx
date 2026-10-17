"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldLabel, Notice, PillButton, TextInput } from "@/components/app-ui";
import { confirmDialog } from "@/components/ui/dialogs";
import { useT } from "@/components/i18n/I18nProvider";

// The seller's own delivery network accounts: deliveries on a connected account are booked and paid with the
// network directly, with no Shopinbos fee. The details are checked with the network before they're saved.

export interface NetworkAccountRow {
  id: string;
  name: string;
  account: { label: string; status: string } | null;
  fields: Array<{ key: string; label: string; secret?: boolean }>;
}

export function NetworkAccounts({ networks }: { networks: NetworkAccountRow[] }) {
  const t = useT("shipping", "common");
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function connect(network: NetworkAccountRow) {
    setBusy(network.id);
    setMessage(null);
    const res = await fetch("/api/app/logistics/networks/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network: network.id, credentials: values }),
    }).catch(() => null);
    const json = res ? ((await res.json().catch(() => null)) as { error?: { message?: string } } | null) : null;
    setBusy(null);
    if (!res?.ok) return setMessage({ tone: "error", text: json?.error?.message ?? t("net.connectFailed") });
    setMessage({ tone: "success", text: t("net.connected", { network: network.name }) });
    setOpen(null);
    setValues({});
    router.refresh();
  }

  async function disconnect(network: NetworkAccountRow) {
    if (!(await confirmDialog(t("net.disconnectConfirm", { network: network.name })))) return;
    setBusy(network.id);
    setMessage(null);
    const res = await fetch(`/api/app/logistics/networks/accounts?network=${encodeURIComponent(network.id)}`, { method: "DELETE" }).catch(() => null);
    const json = res ? ((await res.json().catch(() => null)) as { error?: { message?: string } } | null) : null;
    setBusy(null);
    if (!res?.ok) return setMessage({ tone: "error", text: json?.error?.message ?? t("net.connectFailed") });
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <ul className="m-0 grid list-none gap-2 p-0">
        {networks.map((network) => (
          <li key={network.id} className="rounded-[16px] border border-app-line bg-white px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[14.5px] font-extrabold">{network.name}</div>
                <div className="truncate text-[12.5px] text-app-ink-soft">
                  {network.account ? t("net.connectedAs", { label: network.account.label }) : t("net.notConnected")}
                </div>
              </div>
              {network.account ? (
                <PillButton tone="white" size="sm" busy={busy === network.id} onClick={() => disconnect(network)}>{t("net.disconnect")}</PillButton>
              ) : (
                <PillButton tone="white" size="sm" onClick={() => { setOpen(open === network.id ? null : network.id); setValues({}); setMessage(null); }}>
                  {open === network.id ? t("cancel") : t("net.connect")}
                </PillButton>
              )}
            </div>
            {open === network.id && !network.account && (
              <form className="mt-3 grid gap-3" onSubmit={(e) => { e.preventDefault(); void connect(network); }}>
                {network.fields.map((field) => (
                  <div key={field.key}>
                    <FieldLabel htmlFor={`acct-${network.id}-${field.key}`}>{field.label}</FieldLabel>
                    <TextInput
                      id={`acct-${network.id}-${field.key}`}
                      required
                      type={field.secret ? "password" : "text"}
                      autoComplete="off"
                      value={values[field.key] ?? ""}
                      onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                    />
                  </div>
                ))}
                <PillButton type="submit" tone="ink" size="sm" busy={busy === network.id}>{t("net.connectSave")}</PillButton>
              </form>
            )}
          </li>
        ))}
      </ul>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <p className="m-0 text-[12.5px] leading-5 text-app-ink-soft">{t("net.ownAccountNote")}</p>
    </div>
  );
}
