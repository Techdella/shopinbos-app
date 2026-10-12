"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead, Pill, SplitLayout } from "@/components/app-kit";
import { Notice, PillButton, Segmented } from "@/components/app-ui";
import { Modal } from "@/components/growth/Modal";
import { Field, buttonClass, inputClass, selectClass, textareaClass } from "@/components/growth/kit";
import type { ChannelStatus } from "@/lib/marketing/channels";
import type { CampaignChannelConfig } from "@/lib/marketing/campaign-config";
import { variableCount } from "@/lib/marketing/text-channels";
import { EmailComposer } from "../../_kit/EmailComposer";
import { EmailPreview, VariableChips, api, errorText, insertAtCursor, useDebounced } from "../../_kit/client";
import { categoryLabel, friendlyName } from "../../_kit/friendly";
import { ChannelHelp, SmsCounter, TEMPLATE_STATUS, TemplateStatusPill, VariableMapper, WhatsAppBubble, type TemplateOption } from "../../_kit/text";
import { TextPreview } from "./TextPreview";

type Channel = "email" | "sms" | "whatsapp";

interface Draft {
  id: string | null;
  status: string;
  name: string;
  channel: Channel;
  subject: string;
  preheader: string;
  bodyHtml: string;
  segmentId: string | null;
  audienceMode: "all" | "subscribers";
  scheduledAt: string;
  channelConfig: CampaignChannelConfig;
}

const CHANNEL_LABEL: Record<Channel, string> = { email: "Email", sms: "SMS", whatsapp: "WhatsApp" };

export function CampaignEditor({
  initial,
  segments,
  templates,
  channels,
  testTo,
  waTemplates,
  products,
  sms,
}: {
  initial: Draft;
  segments: Array<{ id: string; name: string; summary: string; count: number }>;
  templates: Array<{ id: string; name: string; subject: string; preheader: string; bodyHtml: string; saved: boolean }>;
  channels: Record<Channel, ChannelStatus>;
  testTo: { email: string | null; phone: string | null };
  waTemplates: TemplateOption[];
  products: Array<{ id: string; name: string; image: string | null }>;
  sms: { senderId: string | null; costPerSegment: number | null; currency: string };
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(initial);
  const [composerKey, setComposerKey] = useState(0);
  const [audience, setAudience] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const set = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
  };

  const audienceKey = useDebounced(JSON.stringify({ channel: draft.channel, segmentId: draft.segmentId, mode: draft.audienceMode }), 300);
  useEffect(() => {
    let cancelled = false;
    const { channel, segmentId, mode } = JSON.parse(audienceKey) as { channel: Channel; segmentId: string | null; mode: "all" | "subscribers" };
    setAudience(null);
    api<{ count: number }>("/api/app/marketing/campaigns/audience", "POST", { channel, segmentId, audience: { mode } })
      .then((data) => !cancelled && setAudience(data.count))
      .catch(() => !cancelled && setAudience(null));
    return () => {
      cancelled = true;
    };
  }, [audienceKey]);

  const scheduled = draft.status === "scheduled";
  const status = channels[draft.channel];
  const ready = status.ready && (draft.channel !== "whatsapp" || Boolean(status.templates));
  const config = draft.channelConfig;
  const setConfig = (patch: Partial<CampaignChannelConfig>) => set({ channelConfig: { ...config, ...patch } });
  const template = waTemplates.find((t) => t.id === config.templateId) ?? null;
  const mapping = config.variables?.some(Boolean) ? config.variables : template?.variables ?? [];
  const product = products.find((p) => p.id === config.productId) ?? null;
  const whatsappProblem =
    draft.channel !== "whatsapp"
      ? null
      : !template
        ? "Pick an approved WhatsApp message."
        : template.status !== "APPROVED"
          ? "WhatsApp hasn't approved this message yet, so it can't be sent. It usually takes a few minutes."
          : Array.from({ length: variableCount(template.content) }).some((_, i) => !mapping[i])
            ? "Pick which customer detail goes in each gap."
            : mapping.includes("discount_code") && !config.discountCode
              ? "Type the discount code to send."
              : template.content.header.format === "IMAGE" && !config.headerImageUrl && !product
                ? "Pick a product or a picture for the top of the message."
                : null;

  async function save(quiet = false): Promise<string | null> {
    setError(null);
    if (!draft.name.trim()) {
      setError("Give the message a name so you can find it later.");
      return null;
    }
    if (draft.channel === "email" && !draft.subject.trim()) {
      setError("Add a subject line.");
      return null;
    }
    if (draft.channel === "sms" && config.senderId && !/^(?=.*[A-Za-z])[A-Za-z0-9 ]{3,11}$/.test(config.senderId)) {
      setError("The name texts come from must be 3 to 11 letters or numbers, with at least one letter.");
      return null;
    }
    setBusy("save");
    try {
      const body = {
        name: draft.name,
        channel: draft.channel,
        subject: draft.channel === "email" ? draft.subject : undefined,
        preheader: draft.channel === "email" ? draft.preheader || null : null,
        bodyHtml: draft.bodyHtml,
        segmentId: draft.segmentId,
        audience: { mode: draft.audienceMode },
        channelConfig: draft.channel === "email" ? {} : draft.channelConfig,
      };
      const saved = draft.id
        ? await api<{ id: string }>(`/api/app/marketing/campaigns/${draft.id}`, "PATCH", body)
        : await api<{ id: string }>("/api/app/marketing/campaigns", "POST", body);
      setDirty(false);
      if (!draft.id) {
        setDraft((current) => ({ ...current, id: saved.id }));
        router.replace(`/home/marketing/campaigns/${saved.id}`);
      }
      if (!quiet) setNotice("Saved.");
      return saved.id;
    } catch (saveError) {
      setError(errorText(saveError));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function act(action: "send" | "test" | "schedule" | "unschedule", extra?: Record<string, unknown>) {
    const id = dirty || !draft.id ? await save(true) : draft.id;
    if (!id) return;
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const result = await api<Record<string, unknown>>(`/api/app/marketing/campaigns/${id}`, "POST", { action, ...extra });
      if (action === "test") setNotice(`Test sent to ${String(result.to)}.`);
      if (action === "schedule") {
        setDraft((current) => ({ ...current, status: "scheduled" }));
        setNotice("Scheduled. It goes out at that time (Lagos), within 10 minutes.");
      }
      if (action === "unschedule") {
        setDraft((current) => ({ ...current, status: "draft", scheduledAt: "" }));
        setNotice("No longer scheduled. It's a draft again.");
      }
      if (action === "send") {
        setConfirmSend(false);
        router.refresh();
      }
    } catch (actionError) {
      setError(errorText(actionError));
    } finally {
      setBusy(null);
      setScheduleOpen(false);
    }
  }

  function applyTemplate(id: string) {
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    if (draft.bodyHtml.trim() && !window.confirm(`Replace your content with "${template.name}"?`)) return;
    set({ subject: template.subject, preheader: template.preheader, bodyHtml: template.bodyHtml, name: draft.name || template.name });
    setComposerKey((key) => key + 1);
  }

  const peopleWord = (n: number) => `${n.toLocaleString("en-NG")} ${n === 1 ? "person" : "people"}`;

  return (
    <div className="grid gap-5">
      {error ? <Notice>{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {!ready ? (
        <Notice tone="info">
          <ChannelHelp label={`${CHANNEL_LABEL[draft.channel]} can't send yet`} howTo="You can still write and save the message. Tap Help and we'll set it up for you." href={status.connectHref} linkLabel={status.connectLabel} />
        </Notice>
      ) : null}

      <SplitLayout
        sideWidth="460px"
        main={
          <>
            <Card className="grid gap-5 p-5 sm:p-6">
              <CardHead title="About this message" />
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Name (only you see this)" htmlFor="c-name">
                  <input id="c-name" value={draft.name} onChange={(e) => set({ name: e.target.value })} className={inputClass} placeholder="e.g. December sale" maxLength={120} />
                </Field>
                <Field label="Send by">
                  <Segmented
                    options={(["email", "sms", "whatsapp"] as Channel[]).map((value) => ({ value, label: CHANNEL_LABEL[value] }))}
                    value={draft.channel}
                    onChange={(channel) => {
                      // Emails and texts are written differently, so switching between them starts a fresh message.
                      const crossing = (channel === "email") !== (draft.channel === "email");
                      if (crossing && draft.bodyHtml.trim() && !window.confirm("Switching between email and text starts a fresh message. Continue?")) return;
                      set({ channel, bodyHtml: crossing ? "" : draft.bodyHtml });
                      setComposerKey((key) => key + 1);
                    }}
                  />
                </Field>
              </div>
            </Card>

            <Card className="grid gap-4 p-5 sm:p-6">
              <CardHead title="Who gets it" sub={audience === null ? "Counting…" : `${peopleWord(audience)} can get this by ${CHANNEL_LABEL[draft.channel]} right now`} />
              <Field label="Group of customers" htmlFor="c-audience" hint={draft.channel === "email" ? "People who unsubscribed are always left out. Every email has an unsubscribe link." : `Only people who said yes to ${CHANNEL_LABEL[draft.channel]} offers (sign-up forms, pop-ups, or added by you with their permission) get it. Anyone who replied STOP is left out. A phone number given when ordering is for order messages only.`}>
                <select
                  id="c-audience"
                  className={selectClass}
                  value={draft.segmentId ? `segment:${draft.segmentId}` : draft.audienceMode}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value.startsWith("segment:")) set({ segmentId: value.slice(8) });
                    else set({ segmentId: null, audienceMode: value as "all" | "subscribers" });
                  }}
                >
                  <option value="all">Everyone: people who signed up and past customers</option>
                  <option value="subscribers">Only people who signed up</option>
                  {segments.length ? (
                    <optgroup label="Your groups of customers">
                      {segments.map((segment) => (
                        <option key={segment.id} value={`segment:${segment.id}`}>
                          {segment.name} ({segment.count})
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </Field>
              {draft.segmentId ? <p className="m-0 text-[13px] text-app-ink-soft">{segments.find((s) => s.id === draft.segmentId)?.summary}</p> : null}
              <a href="/home/marketing/segments" className="text-[13.5px] font-bold text-app-accent-ink no-underline hover:underline">Make a new group of customers</a>
            </Card>

            <Card className="grid gap-4 p-5 sm:p-6">
              <CardHead title="Message" />
              {draft.channel === "email" ? (
                <>
                  <Field label="Start from a ready-made design (optional)" htmlFor="c-template">
                    <select id="c-template" className={selectClass} value="" onChange={(event) => applyTemplate(event.target.value)}>
                      <option value="">Choose a design…</option>
                      {templates.some((t) => t.saved) ? (
                        <optgroup label="Your saved designs">
                          {templates.filter((t) => t.saved).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </optgroup>
                      ) : null}
                      <optgroup label="Ready-made designs">
                        {templates.filter((t) => !t.saved).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </optgroup>
                    </select>
                  </Field>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Subject" htmlFor="c-subject">
                      <input id="c-subject" value={draft.subject} onChange={(e) => set({ subject: e.target.value })} className={inputClass} maxLength={200} placeholder="e.g. 20% off this weekend, {{name}}" />
                    </Field>
                    <Field label="Preview text (optional)" htmlFor="c-pre" hint="Shown after the subject in most inboxes.">
                      <input id="c-pre" value={draft.preheader} onChange={(e) => set({ preheader: e.target.value })} className={inputClass} maxLength={200} />
                    </Field>
                  </div>
                  <EmailComposer key={composerKey} value={draft.bodyHtml} onChange={(bodyHtml) => set({ bodyHtml })} variables={["name", "full_name", "store", "store_url"]} />
                </>
              ) : draft.channel === "sms" ? (
                <>
                  <VariableChips only={["name", "store", "store_url"]} onInsert={(token) => set({ bodyHtml: insertAtCursor(textRef.current, draft.bodyHtml, token) })} />
                  <Field label="SMS message" htmlFor="c-text" hint="Plain text only. Say who it's from, and how to stop.">
                    <textarea ref={textRef} id="c-text" rows={6} value={draft.bodyHtml} onChange={(e) => set({ bodyHtml: e.target.value })} className={textareaClass} maxLength={918} placeholder="{{store}}: our December sale starts today, 20% off everything: {{store_url}} Reply STOP to opt out" />
                  </Field>
                  <SmsCounter text={draft.bodyHtml.replace(/{{\s*name\s*}}/g, "Adaeze").replace(/{{\s*store\s*}}/g, "Your shop").replace(/{{\s*store_url\s*}}/g, "https://yourshop.shopinbos.com")} recipients={audience} costPerSegment={sms.costPerSegment} currency={sms.currency} />
                  {!/\bSTOP\b/i.test(draft.bodyHtml) ? (
                    <button type="button" className={`${buttonClass("white", "sm")} justify-self-start`} onClick={() => set({ bodyHtml: `${draft.bodyHtml.trimEnd()} Reply STOP to opt out` })}>Add “Reply STOP to opt out”</button>
                  ) : null}
                  <Field label="Name your texts come from" htmlFor="c-sender" hint={`The name people see instead of a number. Your SMS company has to approve it first. ${sms.senderId ? `Leave empty to use ${sms.senderId}.` : "Leave it empty to use the usual name."}`}>
                    <input id="c-sender" value={config.senderId ?? ""} onChange={(e) => setConfig({ senderId: e.target.value.slice(0, 11) || null })} className={`${inputClass} max-w-[220px]`} maxLength={11} placeholder={sms.senderId ?? "e.g. ADIREHOUSE"} />
                  </Field>
                </>
              ) : !status.templates ? (
                <Notice tone="info">
                  <ChannelHelp label="Connect WhatsApp first" howTo="WhatsApp messages to many customers need your WhatsApp Business number connected." href={status.connectHref} linkLabel={status.connectLabel} />
                </Notice>
              ) : (
                <>
                  <Field label="Approved message" htmlFor="c-wa-template" hint="Offers on WhatsApp must use a message WhatsApp has approved.">
                    <select
                      id="c-wa-template"
                      className={selectClass}
                      value={config.templateId ?? ""}
                      onChange={(e) => {
                        const next = waTemplates.find((t) => t.id === e.target.value);
                        setConfig({ templateId: e.target.value || null, variables: next ? [...next.variables] : [] });
                      }}
                    >
                      <option value="">Choose a message…</option>
                      {waTemplates.map((t) => (
                        <option key={t.id} value={t.id} disabled={t.status !== "APPROVED"}>
                          {friendlyName(t.name)}{t.status !== "APPROVED" ? ` · ${(TEMPLATE_STATUS[t.status]?.label ?? "not approved").toLowerCase()}` : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <p className="m-0 text-[13px]">
                    {waTemplates.some((t) => t.status === "APPROVED") ? null : "No approved messages yet. "}
                    <a href="/home/marketing/whatsapp" className="font-bold text-app-accent-ink no-underline hover:underline">Write or change WhatsApp messages</a>
                  </p>
                  {template ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2 text-[13px]">
                        <TemplateStatusPill status={template.status} />
                        <span className="text-app-ink-soft">{categoryLabel(template.category)}</span>
                      </div>
                      <VariableMapper template={template} value={config.variables ?? []} onChange={(variables) => setConfig({ variables })} />
                      {mapping.includes("discount_code") ? (
                        <Field label="Discount code" htmlFor="c-wa-code" hint="Make it in Discounts first; it goes into the message as written.">
                          <input id="c-wa-code" value={config.discountCode ?? ""} onChange={(e) => setConfig({ discountCode: e.target.value.toUpperCase().slice(0, 40) || null })} className={`${inputClass} max-w-[240px]`} placeholder="e.g. DEC20" />
                        </Field>
                      ) : null}
                      {template.content.header.format === "IMAGE" || mapping.some((v) => v === "product_name" || v === "product_link") ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          <Field label="Product (optional)" htmlFor="c-wa-product" hint={template.content.header.format === "IMAGE" ? "Its photo goes at the top of the message." : "Fills the product name and link."}>
                            <select id="c-wa-product" className={selectClass} value={config.productId ?? ""} onChange={(e) => setConfig({ productId: e.target.value || null })}>
                              <option value="">None</option>
                              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </Field>
                          {template.content.header.format === "IMAGE" ? (
                            <Field label="Or a link to a picture" htmlFor="c-wa-image" hint="A link starting with https:// to a JPG or PNG picture.">
                              <input id="c-wa-image" value={config.headerImageUrl ?? ""} onChange={(e) => setConfig({ headerImageUrl: e.target.value.trim() || null })} className={inputClass} placeholder="https://…" />
                            </Field>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  {whatsappProblem && template ? <p className="m-0 text-[13px] font-semibold text-app-accent-ink">{whatsappProblem}</p> : null}
                </>
              )}
            </Card>

            <Card className="flex flex-wrap items-center gap-2 p-4 sm:p-5">
              <PillButton size="md" tone="white" busy={busy === "save"} onClick={() => void save()}>{draft.id ? "Save" : "Save draft"}</PillButton>
              <PillButton size="md" tone="white" busy={busy === "test"} onClick={() => void act("test")} disabled={!ready || Boolean(whatsappProblem)}>
                Send me a test
              </PillButton>
              {scheduled ? (
                <PillButton size="md" tone="white" busy={busy === "unschedule"} onClick={() => void act("unschedule")}>Don&apos;t send later</PillButton>
              ) : (
                <PillButton size="md" tone="white" onClick={() => setScheduleOpen(true)} disabled={!ready || Boolean(whatsappProblem)}>Schedule</PillButton>
              )}
              <PillButton size="md" tone="accent" className="sm:ml-auto" onClick={() => setConfirmSend(true)} disabled={!ready || !audience || Boolean(whatsappProblem)}>
                Send now
              </PillButton>
              <p className="m-0 w-full text-[12.5px] text-app-ink-soft">
                Tests go to {draft.channel === "email" ? testTo.email ?? "your account email (add one in settings)" : testTo.phone ?? "your phone (add one in settings)"} only.
              </p>
            </Card>
          </>
        }
        side={
          <Card className="p-5">
            <CardHead title="Preview" action={scheduled ? <Pill tone="info">Scheduled</Pill> : <Pill tone="muted">Draft</Pill>} />
            <div className="mt-3">
              {draft.channel === "email" ? (
                <EmailPreview bodyHtml={draft.bodyHtml} preheader={draft.preheader} subject={draft.subject} />
              ) : draft.channel === "whatsapp" ? (
                template ? (
                  <div className="grid gap-2">
                    <WhatsAppBubble content={template.content} mapping={mapping} values={{ ...(config.discountCode ? { discount_code: config.discountCode } : {}), ...(product ? { product_name: product.name } : {}) }} headerImageUrl={config.headerImageUrl || product?.image || null} />
                    <p className="m-0 text-[12.5px] text-app-ink-soft">Preview uses a sample customer (Ada). Each person gets their own name.</p>
                  </div>
                ) : (
                  <p className="m-0 text-[14px] text-app-ink-soft">Pick a message to see it here.</p>
                )
              ) : (
                <TextPreview channel="sms" message={draft.bodyHtml} />
              )}
            </div>
          </Card>
        }
      />

      {confirmSend ? (
        <Modal title="Send this message now?" onClose={() => setConfirmSend(false)}>
          <div className="grid gap-4">
            <p className="m-0 text-[15px] leading-[1.55]">
              {draft.channel === "email" ? <>The email <strong>“{draft.subject}”</strong></> : `This ${CHANNEL_LABEL[draft.channel]} message`} goes to <strong>{peopleWord(audience ?? 0)}</strong> right away. You can't unsend it.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <PillButton size="md" tone="white" onClick={() => setConfirmSend(false)}>Cancel</PillButton>
              <PillButton size="md" tone="accent" busy={busy === "send"} onClick={() => void act("send")}>Send to {peopleWord(audience ?? 0)}</PillButton>
            </div>
          </div>
        </Modal>
      ) : null}

      {scheduleOpen ? (
        <Modal title="Schedule" onClose={() => setScheduleOpen(false)}>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void act("schedule", { scheduledAt: draft.scheduledAt });
            }}
          >
            <Field label="Send on (Lagos time)" htmlFor="c-when" hint={`Goes to everyone in the group at that moment (${audience === null ? "…" : peopleWord(audience)} today).`}>
              <input id="c-when" type="datetime-local" required value={draft.scheduledAt} onChange={(e) => set({ scheduledAt: e.target.value })} className={inputClass} />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className={buttonClass("white")} onClick={() => setScheduleOpen(false)}>Cancel</button>
              <PillButton size="md" type="submit" busy={busy === "schedule"}>Schedule</PillButton>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
