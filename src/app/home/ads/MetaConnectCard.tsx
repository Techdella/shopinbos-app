"use client";

import { confirmDialog } from "@/components/ui/dialogs";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Notice, PillButton, Spinner, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { friendlyError } from "@/lib/errors/report-client";

export interface MetaStatus {
  configured: boolean;
  status: "off" | "connected" | "needs_account" | "reauth";
  accountId: string | null;
  accountName: string | null;
  pageName: string | null;
  currency: string;
}

interface Choice {
  id: string;
  name: string;
  currency?: string;
}

/** Facebook & Instagram ads on the seller's own ad account: connect, pick the ad account and Page, disconnect. */
export function MetaConnectCard({ status, compact = false }: { status: MetaStatus; compact?: boolean }) {
  const t = useT("ads");
  const router = useRouter();
  const [picking, setPicking] = useState(status.status === "needs_account");
  const [choices, setChoices] = useState<{ accounts: Choice[]; pages: Choice[] } | null>(null);
  const [accountId, setAccountId] = useState("");
  const [pageId, setPageId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!picking || choices) return;
    fetch("/api/app/ads/meta?choices=1")
      .then((response) => response.json())
      .then((json: { data?: { choices?: { accounts: Choice[]; pages: Choice[] } }; error?: { message?: string } }) => {
        if (!json.data?.choices) throw new Error(json.error?.message ?? t("m.loadFailed"));
        setChoices(json.data.choices);
        setAccountId(json.data.choices.accounts[0]?.id ?? "");
        setPageId(json.data.choices.pages[0]?.id ?? "");
      })
      .catch((err) => setError(err instanceof Error ? friendlyError(err) : t("m.loadFailed")));
  }, [picking, choices, t]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/app/ads/meta", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId, pageId }) });
      const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(json?.error?.message ?? t("m.saveFailed"));
      setPicking(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err) : t("m.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!(await confirmDialog(t("m.confirmDisconnect")))) return;
    setBusy(true);
    await fetch("/api/app/ads/meta", { method: "DELETE" }).catch(() => null);
    setBusy(false);
    router.refresh();
  }

  const shell = cx("rounded-[18px] border border-app-line bg-white", compact ? "p-4" : "p-5");

  if (!status.configured) {
    return (
      <div className={shell}>
        <p className="m-0 flex items-center gap-2 text-[14.5px] font-extrabold"><Icon name="facebook" size={16} /> {t("m.title")}</p>
        <p className="m-0 mt-1 text-[13.5px] text-app-ink-soft">{t("m.notReady")}</p>
      </div>
    );
  }

  return (
    <div className={shell}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 flex items-center gap-2 text-[14.5px] font-extrabold"><Icon name="facebook" size={16} /> {t("m.title")}</p>
          <p className="m-0 mt-0.5 text-[13px] text-app-ink-soft">
            {status.status === "connected" ? t("m.connected", { account: status.accountName ?? status.accountId ?? "", page: status.pageName ?? "" }) : status.status === "reauth" ? t("m.reauth") : status.status === "needs_account" ? t("m.pick") : t("m.off")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {status.status === "off" || status.status === "reauth" ? (
            <a href="/api/app/ads/meta/connect" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-[#1877F2] px-4 text-[13.5px] font-bold text-white no-underline">
              <Icon name="facebook" size={14} /> {status.status === "reauth" ? t("m.reconnect") : t("m.connect")}
            </a>
          ) : (
            <>
              {!picking ? <PillButton type="button" size="sm" tone="white" onClick={() => setPicking(true)}>{t("m.change")}</PillButton> : null}
              <PillButton type="button" size="sm" tone="white" busy={busy && !picking} onClick={() => void disconnect()}>{t("m.disconnect")}</PillButton>
            </>
          )}
        </div>
      </div>
      {picking && status.status !== "off" ? (
        <div className="mt-3 grid gap-3 rounded-[14px] bg-app-canvas p-3">
          {!choices && !error ? <p className="m-0 flex items-center gap-2 text-[13px]"><Spinner className="h-4 w-4" /> {t("m.loading")}</p> : null}
          {choices ? (
            <>
              {choices.accounts.length === 0 ? <Notice tone="info">{t("m.noAccounts")}</Notice> : null}
              {choices.pages.length === 0 ? <Notice tone="info">{t("m.noPages")}</Notice> : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-[13px] font-bold">
                  {t("m.account")}
                  <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="h-11 rounded-[14px] border border-app-line bg-white px-3 text-[14px]">
                    {choices.accounts.map((item) => <option key={item.id} value={item.id}>{item.name}{item.currency ? ` (${item.currency})` : ""}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-[13px] font-bold">
                  {t("m.page")}
                  <select value={pageId} onChange={(event) => setPageId(event.target.value)} className="h-11 rounded-[14px] border border-app-line bg-white px-3 text-[14px]">
                    {choices.pages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
              </div>
              <PillButton type="button" size="sm" busy={busy} disabled={!accountId || !pageId} className="w-fit" onClick={() => void save()}>{t("m.use")}</PillButton>
            </>
          ) : null}
        </div>
      ) : null}
      {error ? <p role="alert" className="m-0 mt-2 text-[13px] font-bold text-app-danger">{error}</p> : null}
    </div>
  );
}
