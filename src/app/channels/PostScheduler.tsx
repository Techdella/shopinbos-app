"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Notice, PillButton } from "@/components/app-ui";
import { Pill } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { inputClass, selectClass, textareaClass } from "@/components/growth/kit";
import { ConnectFacebookPages, type PagesLoginConfig } from "@/components/meta/ConnectFacebookPages";
import { plainMetaError } from "@/components/simple/plain";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatDate } from "@shared/i18n";
import { CAPTION_MAX, type SocialPlatform } from "@/lib/social/schedule";
import type { ScheduledPostView, SocialAccountView } from "@/lib/social/publish.server";
import type { ComposerProduct } from "./PostComposer";

// Schedule posts to the store's Facebook Page and Instagram account (connected with "Connect with Facebook").
// Peggy can write the caption; /api/cron/marketing publishes on time. Times are the seller's own (browser) time.

const PLATFORM_LABEL: Record<SocialPlatform, string> = { facebook: "Facebook", instagram: "Instagram" };
const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "muted" | "info"> = {
  scheduled: "info",
  publishing: "info",
  published: "success",
  partial: "warning",
  failed: "danger",
  canceled: "muted",
};

function localInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(json?.error?.message ?? "Something went wrong. Try again.");
  return json.data as T;
}

export function PostScheduler({ config, products, initialAccounts, initialPosts }: { config: PagesLoginConfig | null; products: ComposerProduct[]; initialAccounts: SocialAccountView[]; initialPosts: ScheduledPostView[] }) {
  const t = useT("social", "common");
  const locale = useLocale();
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [posts, setPosts] = useState(initialPosts);
  const connected = useMemo(() => accounts.filter((a) => a.status === "connected").map((a) => a.platform), [accounts]);

  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [caption, setCaption] = useState("");
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(connected);
  const [when, setWhen] = useState(() => localInputValue(new Date(Date.now() + 60 * 60_000)));
  const [busy, setBusy] = useState<"write" | "save" | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const product = products.find((p) => p.id === productId) ?? null;
  const needsPhoto = platforms.includes("instagram") && !product?.image;

  async function refresh() {
    const data = await api<{ accounts: SocialAccountView[]; posts: ScheduledPostView[] }>("/api/app/social/posts");
    setAccounts(data.accounts);
    setPosts(data.posts);
    setPlatforms(data.accounts.filter((a) => a.status === "connected").map((a) => a.platform));
    router.refresh();
  }

  async function write() {
    if (!product) return;
    setBusy("write");
    setMessage(null);
    try {
      const data = await api<{ caption: string; ai: boolean }>("/api/app/social/caption", { method: "POST", body: JSON.stringify({ productId: product.id, channel: platforms.includes("instagram") ? "instagram" : "facebook" }) });
      setCaption(data.caption);
      if (!data.ai) setMessage({ tone: "error", text: t("pc.noAi") });
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function schedule() {
    setBusy("save");
    setMessage(null);
    try {
      const at = new Date(when);
      const post = await api<ScheduledPostView>("/api/app/social/posts", {
        method: "POST",
        body: JSON.stringify({ platforms, caption, productId: product?.id ?? null, imageUrl: product?.image ?? null, link: product?.url ?? null, scheduledAt: at.toISOString() }),
      });
      setPosts((current) => [post, ...current].sort((a, b) => Number(b.status === "scheduled") - Number(a.status === "scheduled") || a.scheduledAt.localeCompare(b.scheduledAt)));
      setCaption("");
      setMessage({ tone: "success", text: t("sched.scheduled", { when: formatDate(at, locale, { dateStyle: "medium", timeStyle: "short" }) }) });
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function cancel(id: string) {
    if (!window.confirm(t("sched.confirmCancel"))) return;
    try {
      await api(`/api/app/social/posts/${encodeURIComponent(id)}`, { method: "DELETE" });
      setPosts((current) => current.map((p) => (p.id === id ? { ...p, status: "canceled" } : p)));
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    }
  }

  async function disconnect(account: SocialAccountView) {
    if (!window.confirm(t("sched.confirmDisconnect", { name: account.name }))) return;
    try {
      await api(`/api/app/social/accounts/${account.platform}`, { method: "DELETE" });
      await refresh();
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    }
  }

  const upcoming = posts.filter((p) => p.status === "scheduled" || p.status === "publishing");
  const past = posts.filter((p) => p.status !== "scheduled" && p.status !== "publishing");

  return (
    <div className="grid gap-4">
      {accounts.length ? (
        <div className="grid gap-2">
          <div className="text-[13px] font-bold text-app-ink-soft">{t("sched.accounts")}</div>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {accounts.map((account) => (
              <li key={account.platform} className="flex min-h-[44px] items-center gap-2 rounded-full bg-app-canvas py-1 pl-3 pr-1 text-[14px]">
                <Icon name={account.platform} size={16} />
                <span className="font-bold">{account.name}</span>
                {account.lastError && <Pill tone="warning" dot>{t("sched.attention")}</Pill>}
                <button type="button" onClick={() => void disconnect(account)} aria-label={t("sched.disconnect")} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white">
                  <Icon name="x" size={14} />
                </button>
              </li>
            ))}
          </ul>
          {accounts.filter((a) => a.lastError).map((a) => <Notice key={a.platform} tone="error">{plainMetaError(a.lastError)}</Notice>)}
        </div>
      ) : (
        <p className="m-0 text-[14px] leading-[1.5] text-app-ink-soft">{t("sched.connectFirst")}</p>
      )}

      <ConnectFacebookPages config={config} defaults={{ messenger: false, instagramDms: false, publishing: true }} onConnected={() => void refresh()} label={accounts.length ? t("sched.changePage") : undefined} />

      {connected.length > 0 && (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void schedule();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-[13.5px] font-bold">
              {t("sched.product")}
              <select className={selectClass} value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">{t("sched.noProduct")}</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-[13.5px] font-bold">
              {t("sched.when")}
              <input type="datetime-local" required className={inputClass} value={when} onChange={(e) => setWhen(e.target.value)} />
            </label>
          </div>

          <fieldset className="m-0 flex flex-wrap gap-4 border-0 p-0">
            <legend className="mb-1 text-[13.5px] font-bold">{t("sched.platforms")}</legend>
            {connected.map((platform) => (
              <label key={platform} className="flex min-h-[44px] items-center gap-2 text-[14px]">
                <input type="checkbox" className="h-5 w-5 accent-[#0E2A38]" checked={platforms.includes(platform)} onChange={(e) => setPlatforms((list) => (e.target.checked ? [...list, platform] : list.filter((p) => p !== platform)))} />
                {PLATFORM_LABEL[platform]}
              </label>
            ))}
          </fieldset>

          <label className="grid gap-1 text-[13.5px] font-bold">
            <span className="flex flex-wrap items-center justify-between gap-2">
              {t("sched.caption")}
              {product && <PillButton size="sm" tone="white" busy={busy === "write"} onClick={() => void write()}>{t("sched.write")}</PillButton>}
            </span>
            <textarea className={textareaClass} rows={5} maxLength={CAPTION_MAX} required value={caption} onChange={(e) => setCaption(e.target.value)} />
            <span className="text-[12px] font-normal text-app-ink-soft">{t("sched.left", { count: CAPTION_MAX - caption.length })}</span>
          </label>

          {needsPhoto && <Notice tone="error">{t("sched.igNeedsPhoto")}</Notice>}
          <div>
            <PillButton type="submit" size="md" busy={busy === "save"} disabled={!platforms.length || !caption.trim() || needsPhoto}>{t("sched.schedule")}</PillButton>
          </div>
        </form>
      )}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {connected.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[{ title: t("sched.upcoming"), list: upcoming, empty: t("sched.empty") }, { title: t("sched.past"), list: past, empty: t("sched.noPast") }].map((group) => (
            <div key={group.title} className="grid content-start gap-2">
              <div className="text-[14px] font-bold">{group.title}</div>
              {group.list.length ? (
                <ul className="m-0 grid list-none gap-2 p-0">
                  {group.list.map((post) => (
                    <li key={post.id} className="grid gap-1.5 rounded-[14px] bg-app-canvas px-3.5 py-3 text-[13.5px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone={STATUS_TONE[post.status] ?? "muted"} dot>{t.dynamic(`sched.status.${post.status}`, post.status)}</Pill>
                        <span className="font-bold">{formatDate(new Date(post.scheduledAt), locale, { dateStyle: "medium", timeStyle: "short" })}</span>
                        <span className="text-app-ink-soft">{post.platforms.map((p) => PLATFORM_LABEL[p]).join(" + ")}</span>
                      </div>
                      <p className="m-0 line-clamp-2 break-words text-app-ink-soft">{post.caption}</p>
                      <div className="flex flex-wrap items-center gap-3">
                        {post.platforms.map((p) => {
                          const result = post.results[p];
                          if (!result) return null;
                          return result.ok ? (
                            result.url ? <a key={p} href={result.url} target="_blank" rel="noopener noreferrer" className="font-bold text-app-ink underline">{t("sched.view", { platform: PLATFORM_LABEL[p] })}</a> : null
                          ) : (
                            <span key={p} className="text-app-danger">{PLATFORM_LABEL[p]}: {plainMetaError(result.error)}</span>
                          );
                        })}
                        {post.status === "scheduled" && <button type="button" onClick={() => void cancel(post.id)} className="min-h-[36px] font-bold text-app-ink underline">{t("sched.cancel")}</button>}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-[13.5px] text-app-ink-soft">{group.empty}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
