"use client";

import { SMS_ENABLED } from "@/lib/features";
import { confirmDialog } from "@/components/ui/dialogs";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead, Pill, SplitLayout } from "@/components/app-kit";
import { Notice, PillButton, Segmented } from "@/components/app-ui";
import { Modal } from "@/components/growth/Modal";
import { MediaPicker } from "@/components/media/MediaPicker";
import { Field, buttonClass, inputClass, selectClass, textareaClass } from "@/components/growth/kit";
import type { ChannelStatus } from "@/lib/marketing/channels";
import type { CampaignChannelConfig } from "@/lib/marketing/campaign-config";
import { variableCount } from "@/lib/marketing/text-channels";
import { EmailComposer } from "../../_kit/EmailComposer";
import { EmailPreview, VariableChips, api, errorText, insertAtCursor, useDebounced } from "../../_kit/client";
import { categoryLabel, friendlyName } from "../../_kit/friendly";
import { ChannelHelp, SmsCounter, TemplateStatusPill, VariableMapper, WhatsAppBubble, useTemplateStatusLabel, type TemplateOption } from "../../_kit/text";
import { TextPreview } from "./TextPreview";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatNumber } from "@shared/i18n";

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
  const t = useT("marketing", "common");
  const tb = useT("emailBuilder");
  const locale = useLocale();
  const statusLabel = useTemplateStatusLabel();
  const CHANNEL_LABEL: Record<Channel, string> = { email: t("channel.email"), sms: "SMS", whatsapp: "WhatsApp" };
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
  const template = waTemplates.find((item) => item.id === config.templateId) ?? null;
  const mapping = config.variables?.some(Boolean) ? config.variables : template?.variables ?? [];
  const product = products.find((p) => p.id === config.productId) ?? null;
  const whatsappProblem =
    draft.channel !== "whatsapp"
      ? null
      : !template
        ? t("editor.wa.pickTemplate")
        : template.status !== "APPROVED"
          ? t("editor.wa.notApproved")
          : Array.from({ length: variableCount(template.content) }).some((_, i) => !mapping[i])
            ? t("editor.wa.pickDetails")
            : mapping.includes("discount_code") && !config.discountCode
              ? t("editor.wa.typeCode")
              : template.content.header.format === "IMAGE" && !config.headerImageUrl && !product
                ? t("editor.wa.pickPicture")
                : null;

  async function save(quiet = false): Promise<string | null> {
    setError(null);
    if (!draft.name.trim()) {
      setError(t("editor.err.name"));
      return null;
    }
    if (draft.channel === "email" && !draft.subject.trim()) {
      setError(t("editor.err.subject"));
      return null;
    }
    if (draft.channel === "sms" && config.senderId && !/^(?=.*[A-Za-z])[A-Za-z0-9 ]{3,11}$/.test(config.senderId)) {
      setError(t("editor.err.senderId"));
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
      if (!quiet) setNotice(t("editor.saved"));
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
      if (action === "test") setNotice(t("editor.testSent", { to: String(result.to) }));
      if (action === "schedule") {
        setDraft((current) => ({ ...current, status: "scheduled" }));
        setNotice(t("editor.scheduledNotice"));
      }
      if (action === "unschedule") {
        setDraft((current) => ({ ...current, status: "draft", scheduledAt: "" }));
        setNotice(t("editor.unscheduledNotice"));
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

  async function applyTemplate(id: string) {
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    if (draft.bodyHtml.trim() && !(await confirmDialog(t("editor.confirmReplace", { name: template.name })))) return;
    set({ subject: template.subject, preheader: template.preheader, bodyHtml: template.bodyHtml, name: draft.name || template.name });
    setComposerKey((key) => key + 1);
  }

  const peopleWord = (n: number) => t("campaign.people", { count: n });

  return (
    <div className="grid gap-5">
      {error ? <Notice>{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {!ready ? (
        <Notice tone="info">
          <ChannelHelp label={t("editor.cantSendYet", { channel: CHANNEL_LABEL[draft.channel] })} howTo={t("editor.cantSendHow")} href={status.connectHref} linkLabel={status.connectLabel} />
        </Notice>
      ) : null}

      <SplitLayout
        sideWidth="460px"
        main={
          <>
            <Card className="grid gap-5 p-5 sm:p-6">
              <CardHead title={t("campaign.metaTitle")} />
              <div className="grid gap-4 md:grid-cols-2">
                <Field label={t("editor.name")} htmlFor="c-name">
                  <input id="c-name" value={draft.name} onChange={(e) => set({ name: e.target.value })} className={inputClass} placeholder={t("editor.namePlaceholder")} maxLength={120} />
                </Field>
                <Field label={t("editor.sendBy")}>
                  <Segmented
                    options={(["email", "sms", "whatsapp"] as Channel[]).filter((value) => value !== "sms" || SMS_ENABLED || draft.channel === "sms").map((value) => ({ value, label: CHANNEL_LABEL[value] }))}
                    value={draft.channel}
                    onChange={async (channel) => {
                      // Emails and texts are written differently, so switching between them starts a fresh message.
                      const crossing = (channel === "email") !== (draft.channel === "email");
                      if (crossing && draft.bodyHtml.trim() && !(await confirmDialog(t("editor.confirmCrossing")))) return;
                      set({ channel, bodyHtml: crossing ? "" : draft.bodyHtml });
                      setComposerKey((key) => key + 1);
                    }}
                  />
                </Field>
              </div>
            </Card>

            <Card className="grid gap-4 p-5 sm:p-6">
              <CardHead title={t("editor.whoGetsIt")} sub={audience === null ? t("editor.counting") : t("editor.canGetNow", { people: peopleWord(audience), channel: CHANNEL_LABEL[draft.channel] })} />
              <Field label={t("campaign.audience")} htmlFor="c-audience" hint={draft.channel === "email" ? t("editor.audienceEmailHint") : t("editor.audienceTextHint", { channel: CHANNEL_LABEL[draft.channel] })}>
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
                  <option value="all">{t("editor.everyone")}</option>
                  <option value="subscribers">{t("editor.subscribersOnly")}</option>
                  {segments.length ? (
                    <optgroup label={t("editor.savedSegments")}>
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
              <a href="/home/marketing/segments" className="text-[13.5px] font-bold text-app-accent-ink no-underline hover:underline">{t("editor.newSegment")}</a>
            </Card>

            <Card className="grid gap-4 p-5 sm:p-6">
              <CardHead title={t("editor.message")} />
              {draft.channel === "email" ? (
                <>
                  <Field label={t("editor.startFromTemplate")} htmlFor="c-template">
                    <select id="c-template" className={selectClass} value="" onChange={(event) => applyTemplate(event.target.value)}>
                      <option value="">{t("editor.chooseTemplate")}</option>
                      {templates.some((item) => item.saved) ? (
                        <optgroup label={t("editor.yourTemplates")}>
                          {templates.filter((item) => item.saved).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </optgroup>
                      ) : null}
                      <optgroup label={t("editor.starterTemplates")}>
                        {templates.filter((item) => !item.saved).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </optgroup>
                    </select>
                  </Field>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label={t("campaign.subject")} htmlFor="c-subject">
                      <input id="c-subject" value={draft.subject} onChange={(e) => set({ subject: e.target.value })} className={inputClass} maxLength={200} placeholder={t("editor.subjectPlaceholder")} />
                    </Field>
                    <Field label={t("editor.previewText")} htmlFor="c-pre" hint={t("editor.previewTextHint")}>
                      <input id="c-pre" value={draft.preheader} onChange={(e) => set({ preheader: e.target.value })} className={inputClass} maxLength={200} />
                    </Field>
                  </div>
                  <EmailComposer key={composerKey} value={draft.bodyHtml} onChange={(bodyHtml) => set({ bodyHtml })} variables={["name", "full_name", "store", "store_url"]} />
                </>
              ) : draft.channel === "sms" ? (
                <>
                  <VariableChips only={["name", "store", "store_url"]} onInsert={(token) => set({ bodyHtml: insertAtCursor(textRef.current, draft.bodyHtml, token) })} />
                  <Field label={t("editor.smsMessage")} htmlFor="c-text" hint={t("editor.smsHint")}>
                    <textarea ref={textRef} id="c-text" rows={6} value={draft.bodyHtml} onChange={(e) => set({ bodyHtml: e.target.value })} className={textareaClass} maxLength={918} placeholder={t("editor.smsPlaceholder")} />
                    <VoiceInputButton value={draft.bodyHtml} onChange={(bodyHtml) => set({ bodyHtml })} maxLength={918} context="a text message to customers" className="mt-2" />
                  </Field>
                  <SmsCounter text={draft.bodyHtml.replace(/{{\s*name\s*}}/g, "Adaeze").replace(/{{\s*store\s*}}/g, tb("bs.link.shop")).replace(/{{\s*store_url\s*}}/g, "https://yourshop.shopinbos.com")} recipients={audience} costPerSegment={sms.costPerSegment} currency={sms.currency} />
                  {!/\bSTOP\b/i.test(draft.bodyHtml) ? (
                    <button type="button" className={`${buttonClass("white", "sm")} justify-self-start`} onClick={() => set({ bodyHtml: `${draft.bodyHtml.trimEnd()} ${t("editor.replyStop")}` })}>{t("editor.addReplyStop", { text: t("editor.replyStop") })}</button>
                  ) : null}
                  <Field label={t("editor.senderName")} htmlFor="c-sender" hint={`${t("editor.senderHint")} ${sms.senderId ? t("editor.senderLeaveEmpty", { id: sms.senderId }) : t("editor.senderLeaveEmptyUsual")}`}>
                    <input id="c-sender" value={config.senderId ?? ""} onChange={(e) => setConfig({ senderId: e.target.value.slice(0, 11) || null })} className={`${inputClass} max-w-[220px]`} maxLength={11} placeholder={sms.senderId ?? t("editor.senderPlaceholder")} />
                  </Field>
                </>
              ) : !status.templates ? (
                <Notice tone="info">
                  <ChannelHelp label={t("editor.connectWhatsApp")} howTo={t("editor.connectWhatsAppHow")} href={status.connectHref} linkLabel={status.connectLabel} />
                </Notice>
              ) : (
                <>
                  <Field label={t("editor.approvedTemplate")} htmlFor="c-wa-template" hint={t("editor.approvedTemplateHint")}>
                    <select
                      id="c-wa-template"
                      className={selectClass}
                      value={config.templateId ?? ""}
                      onChange={(e) => {
                        const next = waTemplates.find((item) => item.id === e.target.value);
                        setConfig({ templateId: e.target.value || null, variables: next ? [...next.variables] : [] });
                      }}
                    >
                      <option value="">{t("editor.chooseTemplate")}</option>
                      {waTemplates.map((item) => (
                        <option key={item.id} value={item.id} disabled={item.status !== "APPROVED"}>
                          {friendlyName(item.name)}{item.status !== "APPROVED" ? ` · ${statusLabel(item.status).toLowerCase()}` : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <p className="m-0 text-[13px]">
                    {waTemplates.some((item) => item.status === "APPROVED") ? null : `${t("editor.noApproved")} `}
                    <a href="/home/marketing/whatsapp" className="font-bold text-app-accent-ink no-underline hover:underline">{t("editor.manageWhatsApp")}</a>
                  </p>
                  {template ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2 text-[13px]">
                        <TemplateStatusPill status={template.status} />
                        <span className="text-app-ink-soft">{t.dynamic(`wa.category.${template.category}`, categoryLabel(template.category))}</span>
                      </div>
                      <VariableMapper template={template} value={config.variables ?? []} onChange={(variables) => setConfig({ variables })} />
                      {mapping.includes("discount_code") ? (
                        <Field label={t("editor.discountCode")} htmlFor="c-wa-code" hint={t("editor.discountCodeHint")}>
                          <input id="c-wa-code" value={config.discountCode ?? ""} onChange={(e) => setConfig({ discountCode: e.target.value.toUpperCase().slice(0, 40) || null })} className={`${inputClass} max-w-[240px]`} placeholder={t("editor.discountPlaceholder")} />
                        </Field>
                      ) : null}
                      {template.content.header.format === "IMAGE" || mapping.some((v) => v === "product_name" || v === "product_link") ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          <Field label={t("editor.productOptional")} htmlFor="c-wa-product" hint={template.content.header.format === "IMAGE" ? t("editor.productPhotoHint") : t("editor.productFillsHint")}>
                            <select id="c-wa-product" className={selectClass} value={config.productId ?? ""} onChange={(e) => setConfig({ productId: e.target.value || null })}>
                              <option value="">{t("editor.none")}</option>
                              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </Field>
                          {template.content.header.format === "IMAGE" ? (
                            <Field label={t("editor.orPicture")} htmlFor="c-wa-image-choose" hint={t("editor.orPictureHint")}>
                              <MediaPicker id="c-wa-image" value={config.headerImageUrl ?? ""} onChange={(url) => setConfig({ headerImageUrl: url.trim() || null })} compact />
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
              <PillButton size="md" tone="white" busy={busy === "save"} onClick={() => void save()}>{draft.id ? t("save") : t("editor.saveDraft")}</PillButton>
              <PillButton size="md" tone="white" busy={busy === "test"} onClick={() => void act("test")} disabled={!ready || Boolean(whatsappProblem)}>
                {t("editor.sendTest")}
              </PillButton>
              {scheduled ? (
                <PillButton size="md" tone="white" busy={busy === "unschedule"} onClick={() => void act("unschedule")}>{t("editor.dontSendLater")}</PillButton>
              ) : (
                <PillButton size="md" tone="white" onClick={() => setScheduleOpen(true)} disabled={!ready || Boolean(whatsappProblem)}>{t("editor.schedule")}</PillButton>
              )}
              <PillButton size="md" tone="accent" className="sm:ml-auto" onClick={() => setConfirmSend(true)} disabled={!ready || !audience || Boolean(whatsappProblem)}>
                {t("editor.sendNow")}
              </PillButton>
              <p className="m-0 w-full text-[12.5px] text-app-ink-soft">
                {t("editor.testsGoTo", { to: draft.channel === "email" ? testTo.email ?? t("editor.yourAccountEmail") : testTo.phone ?? t("editor.yourPhone") })}
              </p>
            </Card>
          </>
        }
        side={
          <Card className="p-5">
            <CardHead title={t("editor.preview")} action={scheduled ? <Pill tone="info">{t("campaignStatus.scheduled")}</Pill> : <Pill tone="muted">{t("campaignStatus.draft")}</Pill>} />
            <div className="mt-3">
              {draft.channel === "email" ? (
                <EmailPreview bodyHtml={draft.bodyHtml} preheader={draft.preheader} subject={draft.subject} />
              ) : draft.channel === "whatsapp" ? (
                template ? (
                  <div className="grid gap-2">
                    <WhatsAppBubble content={template.content} mapping={mapping} values={{ ...(config.discountCode ? { discount_code: config.discountCode } : {}), ...(product ? { product_name: product.name } : {}) }} headerImageUrl={config.headerImageUrl || product?.image || null} />
                    <p className="m-0 text-[12.5px] text-app-ink-soft">{t("editor.previewSample")}</p>
                  </div>
                ) : (
                  <p className="m-0 text-[14px] text-app-ink-soft">{t("editor.pickTemplateToSee")}</p>
                )
              ) : (
                <TextPreview channel="sms" message={draft.bodyHtml} />
              )}
            </div>
          </Card>
        }
      />

      {confirmSend ? (
        <Modal title={t("editor.confirmSendTitle")} onClose={() => setConfirmSend(false)}>
          <div className="grid gap-4">
            <p className="m-0 text-[15px] leading-[1.55]">
              {draft.channel === "email" ? <>{t("editor.theEmail")} <strong>“{draft.subject}”</strong></> : t("editor.thisMessage", { channel: CHANNEL_LABEL[draft.channel] })} {t("editor.goesTo")} <strong>{peopleWord(audience ?? 0)}</strong> {t("editor.rightAway")}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <PillButton size="md" tone="white" onClick={() => setConfirmSend(false)}>{t("cancel")}</PillButton>
              <PillButton size="md" tone="accent" busy={busy === "send"} onClick={() => void act("send")}>{t("editor.sendTo", { people: peopleWord(audience ?? 0) })}</PillButton>
            </div>
          </div>
        </Modal>
      ) : null}

      {scheduleOpen ? (
        <Modal title={t("editor.schedule")} onClose={() => setScheduleOpen(false)}>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void act("schedule", { scheduledAt: draft.scheduledAt });
            }}
          >
            <Field label={t("editor.sendOn")} htmlFor="c-when" hint={t("editor.sendOnHint", { people: audience === null ? "…" : peopleWord(audience) })}>
              <input id="c-when" type="datetime-local" required value={draft.scheduledAt} onChange={(e) => set({ scheduledAt: e.target.value })} className={inputClass} />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className={buttonClass("white")} onClick={() => setScheduleOpen(false)}>{t("cancel")}</button>
              <PillButton size="md" type="submit" busy={busy === "schedule"}>{t("editor.schedule")}</PillButton>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
