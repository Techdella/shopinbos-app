"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead, Pill, StatGrid, StatTile, type Tone } from "@/components/app-kit";
import { Notice, PillButton } from "@/components/app-ui";
import { Field, inputClass, selectClass, textareaClass } from "@/components/growth/kit";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatDate, formatNumber } from "@shared/i18n";
import type { MessageKey } from "@shared/i18n/catalog";
import { FOLLOWER_TEMPLATE_PRESETS } from "@/lib/marketing/text-channels";
import { BLAST_CHANNELS, FOLLOWER_BLAST_KINDS, checkBlast, fillBlastText, whatsappNewsText, type BlastChannel, type FollowerBlastKind } from "@shared/follower-blasts";
import type { FollowersOverview } from "@/lib/followers/blasts.server";
import { api, errorText } from "../_kit/client";
import { WhatsAppBubble } from "../_kit/text";

type Overview = Omit<FollowersOverview, "blasts" | "allowance"> & {
  blasts: Array<Omit<FollowersOverview["blasts"][number], "createdAt" | "sentAt"> & { createdAt: string; sentAt: string | null }>;
  allowance: Omit<FollowersOverview["allowance"], "nextFreeAt"> & { nextFreeAt: string | null };
};

const STATUS: Record<string, { tone: Tone; label: MessageKey<"followers"> }> = {
  queued: { tone: "info", label: "status.queued" },
  sending: { tone: "info", label: "status.sending" },
  sent: { tone: "success", label: "status.sent" },
  failed: { tone: "warning", label: "status.failed" },
};

const KIND_LABEL: Record<FollowerBlastKind, MessageKey<"followers">> = { drop: "kind.drop", preorder: "kind.preorder", live: "kind.live" };
const CHANNEL_LABEL: Record<BlastChannel, MessageKey<"followers">> = { whatsapp: "channel.whatsapp", email: "channel.email", push: "channel.push" };
const PRESET = FOLLOWER_TEMPLATE_PRESETS[0];

export function FollowersClient({ overview }: { overview: Overview }) {
  const t = useT("followers");
  const locale = useLocale();
  const router = useRouter();
  const [kind, setKind] = useState<FollowerBlastKind>("drop");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [productId, setProductId] = useState("");
  const [link, setLink] = useState("");
  const [channels, setChannels] = useState<BlastChannel[]>(["whatsapp", "email"]);
  const [busy, setBusy] = useState<"send" | "rex" | "whatsapp" | null>(null);
  const [note, setNote] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);

  const { allowance, audience, channels: state } = overview;
  const product = overview.products.find((p) => p.id === productId) ?? null;
  const ready: Record<BlastChannel, boolean> = { whatsapp: state.whatsapp.ready, email: state.email.ready, push: state.push.ready };
  // Followers this reaches on at least one of the picked channels (worked out on the server for every choice).
  const reachable = overview.reachBy[[...channels].sort().join("+")] ?? 0;
  const checked = checkBlast({ kind, title, body, productId: productId || null, link: link || null });
  const sample = { first_name: t("preview.sample"), store_name: overview.storeName, product_name: product?.name ?? "" };
  const previewLink = link || product?.url || overview.storeLink;
  const capped = allowance.left <= 0;

  const problemText = (problem: string) =>
    problem === "title_long" ? t("error.title_long", { max: overview.limits.title }) : problem === "body_long" ? t("error.body_long", { max: overview.limits.body }) : t.dynamic(`error.${problem}`, problem);

  async function draft() {
    setBusy("rex");
    setNote(null);
    try {
      const result = await api<{ ai: boolean; title: string; body: string }>("/api/app/marketing/followers/draft", "POST", { kind, productId: productId || null, language: locale });
      setTitle(result.title);
      setBody(result.body);
      if (!result.ai) setNote({ tone: "info", text: t("rex.fallback") });
    } catch {
      setNote({ tone: "error", text: t("rex.failed") });
    } finally {
      setBusy(null);
    }
  }

  async function setUpWhatsApp() {
    setBusy("whatsapp");
    setNote(null);
    try {
      await api("/api/app/marketing/followers/whatsapp", "POST");
      router.refresh();
    } catch (error) {
      setNote({ tone: "error", text: errorText(error) });
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (checked.problems.length) return setNote({ tone: "error", text: problemText(checked.problems[0]) });
    if (!channels.length) return setNote({ tone: "error", text: t("error.channels") });
    if (!window.confirm(t("confirm", { count: reachable, left: Math.max(0, allowance.left - 1), cap: allowance.cap }))) return;
    setBusy("send");
    setNote(null);
    try {
      await api("/api/app/marketing/followers", "POST", { kind, title: checked.input.title, body: checked.input.body, productId: productId || null, link: link || null, channels });
      setTitle("");
      setBody("");
      setProductId("");
      setLink("");
      setNote({ tone: "success", text: t("sent") });
      router.refresh();
    } catch (error) {
      setNote({ tone: "error", text: errorText(error) });
    } finally {
      setBusy(null);
    }
  }

  const toggleChannel = (channel: BlastChannel) => setChannels((list) => (list.includes(channel) ? list.filter((c) => c !== channel) : [...list, channel]));

  return (
    <div className="grid gap-5">
      <StatGrid className="xl:grid-cols-4">
        <StatTile tone="card" label={t("stat.followers")} value={formatNumber(overview.followers, locale)} hint={t("stat.followersHint")} />
        <StatTile tone="card" label={t("stat.whatsapp")} value={formatNumber(audience.whatsapp, locale)} hint={t("stat.whatsappHint")} />
        <StatTile tone="card" label={t("stat.email")} value={formatNumber(audience.email, locale)} hint={t("stat.emailHint")} />
        <StatTile tone="card" label={t("stat.push")} value="–" hint={t("pushSoon")} />
      </StatGrid>

      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="p-5">
          <CardHead title={t("compose.title")} sub={capped && allowance.nextFreeAt ? t("capReached", { cap: allowance.cap, day: formatDate(allowance.nextFreeAt, locale, { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) }) : t("left", { left: allowance.left, cap: allowance.cap })} />
          {overview.followers === 0 ? <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">{t("noFollowers")}</p> : null}
          <div className="mt-4 grid gap-4">
            <Field label={t("compose.kind")}>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("compose.kind")}>
                {FOLLOWER_BLAST_KINDS.map((option) => (
                  <button key={option} type="button" role="radio" aria-checked={kind === option} onClick={() => setKind(option)} className={`min-h-[40px] rounded-full border px-4 text-[14px] font-bold ${kind === option ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink"}`}>
                    {t(KIND_LABEL[option])}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={t("field.product")} htmlFor="blast-product">
              <select id="blast-product" className={selectClass} value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">{t("field.noProduct")}</option>
                {overview.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <PillButton tone="white" size="sm" busy={busy === "rex"} disabled={busy !== null} onClick={() => void draft()}>{busy === "rex" ? t("rex.drafting") : t("rex.draft")}</PillButton>
            </div>
            <Field label={t("field.title")} htmlFor="blast-title" hint={t("chars", { used: title.length, max: overview.limits.title })}>
              <input id="blast-title" className={inputClass} value={title} maxLength={overview.limits.title} placeholder={t("field.titlePlaceholder")} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label={t("field.message")} htmlFor="blast-body" hint={t("chars", { used: body.length, max: overview.limits.body })}>
              <textarea id="blast-body" className={textareaClass} rows={4} value={body} maxLength={overview.limits.body} placeholder={t("field.messagePlaceholder")} onChange={(e) => setBody(e.target.value)} />
              <button type="button" className="mt-1.5 cursor-pointer border-0 bg-transparent p-0 text-[13px] font-bold text-app-forest" onClick={() => setBody((text) => `${text}${text && !text.endsWith(" ") ? " " : ""}{{first_name}}`.slice(0, overview.limits.body))}>
                {t("insertName")}
              </button>
            </Field>
            <Field label={t("field.link")} htmlFor="blast-link" hint={t("field.linkHint")}>
              <input id="blast-link" type="url" className={inputClass} value={link} placeholder={t("field.linkPlaceholder")} onChange={(e) => setLink(e.target.value.trim())} />
            </Field>

            <Field label={t("channels")}>
              <ul className="m-0 grid list-none gap-2 p-0">
                {BLAST_CHANNELS.map((channel) => (
                  <li key={channel} className="rounded-[14px] border border-app-line px-4 py-3">
                    <label className="flex items-center gap-3">
                      <input type="checkbox" className="h-[18px] w-[18px] accent-[#16141F]" checked={channels.includes(channel) && ready[channel]} disabled={!ready[channel]} onChange={() => toggleChannel(channel)} />
                      <span className="flex-1 text-[14.5px] font-bold">{t(CHANNEL_LABEL[channel])}</span>
                      <span className="text-[13px] text-app-ink-soft">{channel === "push" ? t("pushSoon") : t("channel.count", { count: ready[channel] ? audience[channel] : 0 })}</span>
                    </label>
                    {channel === "whatsapp" ? (
                      <div className="mt-2 grid gap-2 text-[13px] text-app-ink-soft">
                        {state.whatsapp.setup === "connect" ? (
                          <p className="m-0">{t("whatsapp.connect")} <a className="font-bold text-app-forest" href="/home/inbox/chatbot?tab=whatsapp">{t("whatsapp.connectButton")}</a></p>
                        ) : state.whatsapp.setup === "template_missing" ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="m-0 flex-1 basis-[220px]">{t("whatsapp.missing")}</p>
                            <PillButton tone="white" size="sm" busy={busy === "whatsapp"} disabled={busy !== null} onClick={() => void setUpWhatsApp()}>{busy === "whatsapp" ? t("whatsapp.settingUp") : t("whatsapp.setUp")}</PillButton>
                          </div>
                        ) : state.whatsapp.setup === "template_pending" ? (
                          <p className="m-0">{t("whatsapp.pending")}</p>
                        ) : state.whatsapp.setup === "template_rejected" ? (
                          <p className="m-0">{t("whatsapp.rejected")} <a className="font-bold text-app-forest" href="/home/marketing/whatsapp">WhatsApp templates</a></p>
                        ) : null}
                        <p className="m-0">{t("whatsapp.optInNote")}</p>
                      </div>
                    ) : null}
                    {channel === "email" && !state.email.ready && state.email.howTo ? <p className="mb-0 mt-2 text-[13px] text-app-ink-soft">{t("email.off", { reason: state.email.howTo })}</p> : null}
                  </li>
                ))}
              </ul>
            </Field>

            <div className="flex flex-wrap items-center gap-3">
              <PillButton tone="accent" busy={busy === "send"} disabled={busy !== null || capped || reachable === 0} onClick={() => void send()}>{busy === "send" ? t("sending") : t("send")}</PillButton>
              <span className="text-[13.5px] text-app-ink-soft">{reachable === 0 && overview.followers > 0 ? t("nobodyReachable") : t("reach", { count: reachable })}</span>
            </div>
            <p className="m-0 text-[12.5px] text-app-ink-soft">{t("capNote", { cap: allowance.cap })}</p>
          </div>
        </Card>

        <div className="grid gap-5">
          <Card className="p-5">
            <CardHead title={t("preview")} />
            <p className="mb-2 mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-app-ink-soft">{t("preview.whatsapp")}</p>
            <WhatsAppBubble content={PRESET.content} mapping={PRESET.variables} values={{ first_name: sample.first_name, store_name: overview.storeName, follower_news: whatsappNewsText({ title: title || t("field.titlePlaceholder"), body: body || t("field.messagePlaceholder") }, sample), link: previewLink }} />
            <p className="mb-2 mt-4 font-mono text-[11px] uppercase tracking-[0.16em] text-app-ink-soft">{t("preview.email")}</p>
            <div className="rounded-[18px] border border-app-line bg-white p-4">
              <p className="m-0 text-[11px] font-bold uppercase tracking-[0.14em] text-app-forest">{t(KIND_LABEL[kind])}</p>
              <p className="m-0 mt-1 text-[18px] font-bold">{fillBlastText(title || t("field.titlePlaceholder"), sample)}</p>
              <p className="m-0 mt-2 whitespace-pre-wrap text-[14px] leading-6">{fillBlastText(body || t("field.messagePlaceholder"), sample)}</p>
              <p className="m-0 mt-3 truncate text-[12.5px] text-app-ink-soft">{previewLink}</p>
            </div>
          </Card>

          <Card className="p-5">
            <CardHead title={t("history")} />
            {overview.blasts.length ? (
              <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
                {overview.blasts.map((blast) => {
                  const status = STATUS[blast.status] ?? STATUS.queued;
                  return (
                    <li key={blast.id} className="grid gap-1 py-3">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[14.5px] font-bold">{blast.title}</span>
                        <Pill tone={status.tone}>{t(status.label)}</Pill>
                      </div>
                      <span className="text-[12.5px] text-app-ink-soft">
                        {[t.dynamic(`kind.${blast.kind}`, blast.kind), blast.channels.map((c) => t.dynamic(`channel.${c}`, c)).join(", "), formatDate(blast.sentAt ?? blast.createdAt, locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })].filter(Boolean).join(" · ")}
                      </span>
                      <span className="text-[13px]">{t("history.counts", { sent: blast.sentCount, failed: blast.failedCount, audience: blast.audienceCount })}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">{t("history.empty")}</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
