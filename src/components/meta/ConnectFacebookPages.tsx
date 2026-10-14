"use client";

import { useState } from "react";
import { Notice, PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { plainMetaError } from "@/components/simple/plain";
import { useT } from "@/components/i18n/I18nProvider";
import { facebookLoginCode } from "./facebook-sdk";

// "Connect with Facebook" for Pages and Instagram: one sign-in, then the seller picks their Page and what to use it
// for (Messenger and Instagram DMs in the inbox, posting from the scheduler). Server: /api/app/meta/pages.

export interface PagesLoginConfig {
  appId: string;
  configId: string;
}

interface PageChoice {
  id: string;
  name: string;
  instagram: { id: string; username: string | null } | null;
  canMessage: boolean;
  canPublish: boolean;
}

interface ConnectResult {
  messenger?: { ok: boolean; error?: string };
  instagram?: { ok: boolean; error?: string };
  publishing?: { ok: boolean; error?: string; platforms?: string[] };
}

type Uses = { messenger: boolean; instagramDms: boolean; publishing: boolean };

async function api<T>(body: unknown): Promise<T> {
  const response = await fetch("/api/app/meta/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(json?.error?.message ?? "Something went wrong. Try again.");
  return json.data as T;
}

export function ConnectFacebookPages({ config, defaults, onConnected, label }: { config: PagesLoginConfig | null; defaults: Uses; onConnected?: (result: ConnectResult) => void; label?: string }) {
  const t = useT("social", "common");
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<string | null>(null);
  const [pages, setPages] = useState<PageChoice[]>([]);
  const [pageId, setPageId] = useState("");
  const [uses, setUses] = useState<Uses>(defaults);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  if (!config) return <p className="m-0 text-[13px] leading-[1.5] text-app-ink-soft">{t("fb.notSetUp")}</p>;

  async function start() {
    if (!config) return;
    setBusy(true);
    setMessage(null);
    try {
      const code = await facebookLoginCode(config.appId, config.configId, { failed: t("fb.sdkFailed"), slow: t("fb.sdkSlow") });
      if (!code) throw new Error(t("fb.closed"));
      const data = await api<{ session: string; pages: PageChoice[] }>({ action: "start", code });
      setSession(data.session);
      setPages(data.pages);
      setPageId(data.pages[0]?.id ?? "");
    } catch (error) {
      setMessage({ tone: "error", text: plainMetaError((error as Error).message) });
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    if (!session || !pageId) return;
    setBusy(true);
    setMessage(null);
    try {
      const chosen = pages.find((p) => p.id === pageId);
      const result = await api<ConnectResult>({
        action: "connect",
        session,
        pageId,
        messenger: uses.messenger && Boolean(chosen?.canMessage),
        instagramDms: uses.instagramDms && Boolean(chosen?.instagram),
        publishing: uses.publishing && Boolean(chosen?.canPublish),
      });
      const failed = [
        result.messenger && !result.messenger.ok ? `${t("fb.messenger")}: ${plainMetaError(result.messenger.error)}` : null,
        result.instagram && !result.instagram.ok ? `${t("fb.instagramDms")}: ${plainMetaError(result.instagram.error)}` : null,
        result.publishing && !result.publishing.ok ? `${t("fb.publishing")}: ${plainMetaError(result.publishing.error)}` : null,
      ].filter(Boolean);
      setMessage(failed.length ? { tone: "error", text: `${t("fb.partial")} ${failed.join(" · ")}` } : { tone: "success", text: t("fb.done") });
      setSession(null);
      setPages([]);
      onConnected?.(result);
    } catch (error) {
      setMessage({ tone: "error", text: plainMetaError((error as Error).message) });
    } finally {
      setBusy(false);
    }
  }

  const page = pages.find((p) => p.id === pageId) ?? null;
  const option = (key: keyof Uses, text: string, disabled = false) => (
    <label className="flex min-h-[44px] items-center gap-3 text-[14px]">
      <input type="checkbox" className="h-5 w-5 accent-[#0E2A38]" checked={uses[key] && !disabled} disabled={disabled} onChange={(e) => setUses((u) => ({ ...u, [key]: e.target.checked }))} />
      <span className={disabled ? "text-app-ink-soft" : undefined}>{text}</span>
    </label>
  );

  return (
    <div className="grid gap-3">
      {!session ? (
        <div>
          <PillButton size="md" tone="ink" busy={busy} onClick={() => void start()}>
            <Icon name="facebook" size={16} /> {label ?? t("fb.connect")}
          </PillButton>
        </div>
      ) : (
        <div className="grid gap-3 rounded-[14px] bg-app-canvas p-4">
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="mb-1 text-[14px] font-bold">{t("fb.pickPage")}</legend>
            {pages.map((p) => (
              <label key={p.id} className="flex min-h-[48px] items-center gap-3 rounded-[12px] bg-white px-3 py-2 text-[14px]">
                <input type="radio" name="fb-page" className="h-5 w-5 accent-[#0E2A38]" checked={pageId === p.id} onChange={() => setPageId(p.id)} />
                <span className="min-w-0">
                  <span className="block font-bold">{p.name}</span>
                  <span className="block text-[12.5px] text-app-ink-soft">{p.instagram ? t("fb.igLinked", { username: p.instagram.username ? `@${p.instagram.username}` : "Instagram" }) : t("fb.noIg")}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset className="m-0 grid gap-0.5 border-0 p-0">
            <legend className="mb-1 text-[14px] font-bold">{t("fb.use")}</legend>
            {option("messenger", t("fb.messenger"), page ? !page.canMessage : false)}
            {option("instagramDms", t("fb.instagramDms"), !page?.instagram)}
            {option("publishing", t("fb.publishing"), page ? !page.canPublish : false)}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <PillButton size="md" busy={busy} onClick={() => void connect()} disabled={!pageId || !(uses.messenger || (uses.instagramDms && page?.instagram) || uses.publishing)}>{t("fb.confirm")}</PillButton>
            <PillButton size="md" tone="ghost" onClick={() => { setSession(null); setPages([]); }}>{t("cancel")}</PillButton>
          </div>
        </div>
      )}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </div>
  );
}
