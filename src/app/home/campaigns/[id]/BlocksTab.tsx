"use client";

import { confirmDialog } from "@/components/ui/dialogs";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, CardHead, Pill } from "@/components/app-kit";
import { Notice, PillButton, Toggle } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { Field, inputClass, selectClass, textareaClass } from "@/components/growth/kit";
import { useT } from "@/components/i18n/I18nProvider";
import { CampaignCountdown } from "@/components/storefront/campaign/CampaignCountdown";
import {
  BADGE_POSITIONS,
  BADGE_RULES,
  COUNTDOWN_DISPLAYS,
  COUNTDOWN_EXPIRY,
  COUNTDOWN_STYLES,
  COUNTDOWN_TARGETS,
  countdownTargetMs,
  fillCampaignText,
  passesAA,
  readAnnouncementSettings,
  readBadgeSettings,
  readCountdownSettings,
  type AnnouncementSettings,
  type BadgeSettings,
  type CountdownSettings,
} from "@/lib/store-campaigns/blocks";
import { COUNTDOWN_FORMATS } from "@/lib/store-campaigns/status";
import { utcToZonedInput, zonedInputToUtc } from "@/lib/store-campaigns/time";
import type { CampaignBlockDTO } from "@/lib/store-campaigns/types";
import type { EditorProps } from "./editor-shared";

// Campaign blocks: the store-wide pieces. Announcement bar (rotating messages with {countdown} and {discount_code}),
// the campaign's pop-up (a store pop-up, designed in Marketing > Forms and pop-ups), product badges and the countdown.

function BlockCard({ title, sub, block, onToggle, busy, children, onRemove }: { title: string; sub: string; block?: CampaignBlockDTO; onToggle?: (on: boolean) => void; busy: boolean; children: React.ReactNode; onRemove?: () => void }) {
  const t = useT("campaigns");
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[17px] font-extrabold">{title}</h2>
          <p className="m-0 mt-0.5 text-[13px] text-app-ink-soft">{sub}</p>
        </div>
        {block && onToggle ? (
          <span className="flex items-center gap-2">
            <span className="text-[13px] font-bold">{block.enabled ? t("blocks.on") : t("blocks.off")}</span>
            <Toggle on={block.enabled} onChange={(on) => !busy && onToggle(on)} label={title} />
          </span>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
      {block && onRemove ? (
        <button type="button" className="mt-4 text-[13px] font-bold text-app-danger underline" onClick={onRemove} disabled={busy}>{t("blocks.remove")}</button>
      ) : null}
    </Card>
  );
}

function AnnouncementEditor({ block, props }: { block: CampaignBlockDTO; props: EditorProps }) {
  const t = useT("campaigns");
  const [settings, setSettings] = useState<AnnouncementSettings>(() => readAnnouncementSettings(block.settings));
  useEffect(() => setSettings(readAnnouncementSettings(block.settings)), [block.settings]);
  const tokens = props.campaign.themeOverride.tokens;
  const background = settings.background || tokens.heroBg || "#111111";
  const text = settings.textColor || tokens.heroText || "#FFFFFF";
  const readable = passesAA(text, background);
  const code = props.campaign.discount && !props.campaign.discount.automatic ? props.campaign.discount.code : "";
  const setMessage = (index: number, patch: Partial<AnnouncementSettings["messages"][number]>) =>
    setSettings((current) => ({ ...current, messages: current.messages.map((message, at) => (at === index ? { ...message, ...patch } : message)) }));
  return (
    <div className="grid gap-4">
      <div className="overflow-hidden rounded-[12px] px-4 py-2.5 text-center text-[13px] font-semibold" style={{ background, color: text }} aria-label={t("blocks.barPreview")}>
        {fillCampaignText(settings.messages[0]?.text || t("blocks.barEmpty"), { discountCode: code || "CODE" }).map((part, at) => (part.kind === "text" ? <span key={at}>{part.value}</span> : <strong key={at}> 02:04:13:22 </strong>))}
      </div>
      {!readable ? <Notice tone="info">{t("blocks.contrast")}</Notice> : null}
      <p className="m-0 text-[12.5px] text-app-ink-soft">{t("blocks.variables", { countdown: "{countdown}", code: "{discount_code}" })}</p>
      {settings.messages.map((message, index) => (
        <div key={index} className="grid gap-3 rounded-[16px] border border-app-line p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-extrabold">{t("blocks.message", { n: index + 1 })}</span>
            <button type="button" className="text-[12.5px] font-bold text-app-danger underline" onClick={() => setSettings((current) => ({ ...current, messages: current.messages.filter((_, at) => at !== index) }))}>{t("blocks.removeMessage")}</button>
          </div>
          <textarea aria-label={t("blocks.messageText")} className={textareaClass} rows={2} maxLength={240} value={message.text} onChange={(event) => setMessage(index, { text: event.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("blocks.link")} hint={t("blocks.linkHint")}>
              <input className={inputClass} value={message.link} placeholder="/shop" onChange={(event) => setMessage(index, { link: event.target.value })} />
            </Field>
            <Field label={t("blocks.linkLabel")}>
              <input className={inputClass} value={message.linkLabel} maxLength={40} placeholder={t("blocks.linkLabelPlaceholder")} onChange={(event) => setMessage(index, { linkLabel: event.target.value })} />
            </Field>
          </div>
        </div>
      ))}
      {settings.messages.length < 5 ? (
        <PillButton tone="white" size="sm" onClick={() => setSettings((current) => ({ ...current, messages: [...current.messages, { text: "", link: "", linkLabel: "" }] }))}>
          <Icon name="plus" size={14} /> {t("blocks.addMessage")}
        </PillButton>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t("blocks.rotate")} hint={t("blocks.rotateHint")}>
          <input type="number" min={3} max={30} className={inputClass} value={settings.rotateSeconds} onChange={(event) => setSettings((current) => ({ ...current, rotateSeconds: Number(event.target.value) || 5 }))} />
        </Field>
        <Field label={t("blocks.barBackground")} hint={t("blocks.colourHint")}>
          <input type="color" className="h-[48px] w-full cursor-pointer rounded-[14px] border border-app-line bg-white p-1" value={background} onChange={(event) => setSettings((current) => ({ ...current, background: event.target.value }))} />
        </Field>
        <Field label={t("blocks.barText")}>
          <input type="color" className="h-[48px] w-full cursor-pointer rounded-[14px] border border-app-line bg-white p-1" value={text} onChange={(event) => setSettings((current) => ({ ...current, textColor: event.target.value }))} />
        </Field>
      </div>
      {settings.background || settings.textColor ? <button type="button" className="justify-self-start text-[12.5px] font-bold text-app-accent-ink underline" onClick={() => setSettings((current) => ({ ...current, background: "", textColor: "" }))}>{t("blocks.useCampaignColours")}</button> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 rounded-[14px] bg-app-canvas px-4 py-3 text-[14px] font-bold">{t("blocks.dismissible")}<Toggle on={settings.dismissible} onChange={(on) => setSettings((current) => ({ ...current, dismissible: on }))} label={t("blocks.dismissible")} /></label>
        <label className="flex items-center justify-between gap-3 rounded-[14px] bg-app-canvas px-4 py-3 text-[14px] font-bold">{t("blocks.sticky")}<Toggle on={settings.sticky} onChange={(on) => setSettings((current) => ({ ...current, sticky: on }))} label={t("blocks.sticky")} /></label>
      </div>
      <PillButton tone="ink" size="md" disabled={props.busy} onClick={() => void props.save(`/api/app/campaigns/${props.campaign.id}/blocks/${block.id}`, "PATCH", { settings })}>{t("blocks.save")}</PillButton>
    </div>
  );
}

function BadgeEditor({ block, props }: { block: CampaignBlockDTO; props: EditorProps }) {
  const t = useT("campaigns");
  const [settings, setSettings] = useState<BadgeSettings>(() => readBadgeSettings(block.settings));
  const [search, setSearch] = useState("");
  useEffect(() => setSettings(readBadgeSettings(block.settings)), [block.settings]);
  const set = (patch: Partial<BadgeSettings>) => setSettings((current) => ({ ...current, ...patch }));
  const products = useMemo(() => props.store.products.filter((product) => !search || product.name.toLowerCase().includes(search.toLowerCase())).slice(0, 40), [props.store.products, search]);
  const ruleLabel: Record<BadgeSettings["appliesTo"], string> = { discounted: t("badge.rule.discounted"), all: t("badge.rule.all"), collection: t("badge.rule.collection"), products: t("badge.rule.products"), tag: t("badge.rule.tag") };
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <span className="rounded-full px-3 py-1 text-[12px] font-bold" style={{ background: settings.background || "#111111", color: settings.textColor || "#FFFFFF" }}>{settings.autoPercent ? "-25%" : settings.label || t("badge.defaultLabel")}</span>
        <span className="text-[12.5px] text-app-ink-soft">{t("badge.previewNote")}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t("badge.label")}>
          <input className={inputClass} maxLength={24} value={settings.label} onChange={(event) => set({ label: event.target.value })} />
        </Field>
        <Field label={t("badge.background")}>
          <input type="color" className="h-[48px] w-full cursor-pointer rounded-[14px] border border-app-line bg-white p-1" value={settings.background || "#111111"} onChange={(event) => set({ background: event.target.value })} />
        </Field>
        <Field label={t("badge.text")}>
          <input type="color" className="h-[48px] w-full cursor-pointer rounded-[14px] border border-app-line bg-white p-1" value={settings.textColor || "#FFFFFF"} onChange={(event) => set({ textColor: event.target.value })} />
        </Field>
      </div>
      {!passesAA(settings.textColor || "#FFFFFF", settings.background || "#111111") ? <Notice tone="info">{t("blocks.contrast")}</Notice> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("badge.appliesTo")}>
          <select className={selectClass} value={settings.appliesTo} onChange={(event) => set({ appliesTo: event.target.value as BadgeSettings["appliesTo"] })}>
            {BADGE_RULES.map((rule) => <option key={rule} value={rule}>{ruleLabel[rule]}</option>)}
          </select>
        </Field>
        <Field label={t("badge.position")}>
          <select className={selectClass} value={settings.position} onChange={(event) => set({ position: event.target.value as BadgeSettings["position"] })}>
            {BADGE_POSITIONS.map((position) => <option key={position} value={position}>{position === "top-left" ? t("badge.topLeft") : t("badge.topRight")}</option>)}
          </select>
        </Field>
      </div>
      {settings.appliesTo === "collection" ? (
        <Field label={t("badge.collection")} hint={props.store.collections.length ? undefined : t("badge.noCollections")}>
          <select className={selectClass} value={settings.collectionId} onChange={(event) => set({ collectionId: event.target.value })}>
            <option value="">{t("badge.pickCollection")}</option>
            {props.store.collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
          </select>
        </Field>
      ) : null}
      {settings.appliesTo === "tag" ? (
        <Field label={t("badge.tag")} hint={t("badge.tagHint")}>
          <input className={inputClass} maxLength={60} value={settings.tag} onChange={(event) => set({ tag: event.target.value })} />
        </Field>
      ) : null}
      {settings.appliesTo === "products" ? (
        <div className="grid gap-2">
          <Field label={t("badge.products", { count: settings.productIds.length })}>
            <input className={inputClass} type="search" placeholder={t("badge.search")} value={search} onChange={(event) => setSearch(event.target.value)} />
          </Field>
          <ul className="m-0 grid max-h-[260px] list-none gap-1 overflow-y-auto p-0">
            {products.map((product) => {
              const on = settings.productIds.includes(product.id);
              return (
                <li key={product.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-[12px] px-2 py-1.5 hover:bg-app-canvas">
                    <input type="checkbox" className="h-[18px] w-[18px]" checked={on} onChange={() => set({ productIds: on ? settings.productIds.filter((id) => id !== product.id) : [...settings.productIds, product.id] })} />
                    {product.images[0] ? <img src={product.images[0]} alt="" className="h-8 w-8 rounded-[8px] object-cover" /> : <span className="h-8 w-8 rounded-[8px] bg-app-canvas" />}
                    <span className="min-w-0 truncate text-[13.5px]">{product.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <label className="flex items-center justify-between gap-3 rounded-[14px] bg-app-canvas px-4 py-3">
        <span>
          <span className="block text-[14px] font-bold">{t("badge.autoPercent")}</span>
          <span className="block text-[12.5px] text-app-ink-soft">{t("badge.autoPercentHint")}</span>
        </span>
        <Toggle on={settings.autoPercent} onChange={(on) => set({ autoPercent: on })} label={t("badge.autoPercent")} />
      </label>
      <PillButton tone="ink" size="md" disabled={props.busy} onClick={() => void props.save(`/api/app/campaigns/${props.campaign.id}/blocks/${block.id}`, "PATCH", { settings })}>{t("blocks.save")}</PillButton>
    </div>
  );
}

function CountdownEditor({ block, props }: { block: CampaignBlockDTO; props: EditorProps }) {
  const t = useT("campaigns");
  const zone = props.campaign.timezone;
  const [settings, setSettings] = useState<CountdownSettings>(() => readCountdownSettings(block.settings));
  useEffect(() => setSettings(readCountdownSettings(block.settings)), [block.settings]);
  const set = (patch: Partial<CountdownSettings>) => setSettings((current) => ({ ...current, ...patch }));
  const target = countdownTargetMs(settings, { startsAt: props.campaign.startsAt ?? props.campaign.suggested?.startsAt, endsAt: props.campaign.endsAt ?? props.campaign.suggested?.endsAt });
  const label = { end: t("countdown.target.end"), start: t("countdown.target.start"), custom: t("countdown.target.custom") };
  const formatLabel = { dhms: t("countdown.format.dhms"), hms: t("countdown.format.hms"), words: t("countdown.format.words") };
  const styleLabel = { boxed: t("countdown.style.boxed"), inline: t("countdown.style.inline"), minimal: t("countdown.style.minimal") };
  const expiryLabel = { hide: t("countdown.expiry.hide"), message: t("countdown.expiry.message"), replace: t("countdown.expiry.replace") };
  const displayLabel = { inline: t("countdown.display.inline"), floating: t("countdown.display.floating") };
  return (
    <div className="grid gap-4">
      <div className="rounded-[14px] bg-[#111111] px-4 py-4 text-center text-white">
        <CampaignCountdown target={target} timeZone={zone} look={{ style: settings.style, format: settings.format, color: "#FFFFFF" }} expiry={settings.expiry} expiredText={settings.expiredText} replace={settings.replaceText ? { text: settings.replaceText, href: "#" } : null} />
        {target === null ? <span className="text-[13px] opacity-80">{t("countdown.noTarget")}</span> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("countdown.target")}>
          <select className={selectClass} value={settings.target} onChange={(event) => set({ target: event.target.value as CountdownSettings["target"] })}>
            {COUNTDOWN_TARGETS.map((value) => <option key={value} value={value}>{label[value]}</option>)}
          </select>
        </Field>
        {settings.target === "custom" ? (
          <Field label={t("countdown.customAt")} hint={t("countdown.inZone", { zone })}>
            <input type="datetime-local" className={inputClass} value={utcToZonedInput(settings.customAt, zone)} onChange={(event) => set({ customAt: zonedInputToUtc(event.target.value, zone)?.toISOString() ?? null })} />
          </Field>
        ) : null}
        <Field label={t("countdown.format")}>
          <select className={selectClass} value={settings.format} onChange={(event) => set({ format: event.target.value as CountdownSettings["format"] })}>
            {COUNTDOWN_FORMATS.map((value) => <option key={value} value={value}>{formatLabel[value]}</option>)}
          </select>
        </Field>
        <Field label={t("countdown.style")}>
          <select className={selectClass} value={settings.style} onChange={(event) => set({ style: event.target.value as CountdownSettings["style"] })}>
            {COUNTDOWN_STYLES.map((value) => <option key={value} value={value}>{styleLabel[value]}</option>)}
          </select>
        </Field>
        <Field label={t("countdown.expiry")}>
          <select className={selectClass} value={settings.expiry} onChange={(event) => set({ expiry: event.target.value as CountdownSettings["expiry"] })}>
            {COUNTDOWN_EXPIRY.map((value) => <option key={value} value={value}>{expiryLabel[value]}</option>)}
          </select>
        </Field>
        <Field label={t("countdown.display")} hint={t("countdown.displayHint")}>
          <select className={selectClass} value={settings.display} onChange={(event) => set({ display: event.target.value as CountdownSettings["display"] })}>
            {COUNTDOWN_DISPLAYS.map((value) => <option key={value} value={value}>{displayLabel[value]}</option>)}
          </select>
        </Field>
      </div>
      {settings.expiry === "message" ? (
        <Field label={t("countdown.expiredText")}>
          <input className={inputClass} maxLength={120} placeholder={t("countdown.expiredPlaceholder")} value={settings.expiredText} onChange={(event) => set({ expiredText: event.target.value })} />
        </Field>
      ) : null}
      {settings.expiry === "replace" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("countdown.replaceText")}>
            <input className={inputClass} maxLength={80} value={settings.replaceText} onChange={(event) => set({ replaceText: event.target.value })} />
          </Field>
          <Field label={t("countdown.replaceLink")} hint={t("blocks.linkHint")}>
            <input className={inputClass} placeholder="/shop" value={settings.replaceLink} onChange={(event) => set({ replaceLink: event.target.value })} />
          </Field>
        </div>
      ) : null}
      {settings.display === "floating" ? (
        <Field label={t("countdown.label")}>
          <input className={inputClass} maxLength={60} placeholder={t("floating.label")} value={settings.label} onChange={(event) => set({ label: event.target.value })} />
        </Field>
      ) : null}
      <PillButton tone="ink" size="md" disabled={props.busy} onClick={() => void props.save(`/api/app/campaigns/${props.campaign.id}/blocks/${block.id}`, "PATCH", { settings })}>{t("blocks.save")}</PillButton>
    </div>
  );
}

export function BlocksTab(props: EditorProps) {
  const t = useT("campaigns");
  const { campaign, store, save, busy } = props;
  const [joinId, setJoinId] = useState("");
  const of = (type: string) => campaign.blocks.filter((block) => block.type === type);
  const announcement = of("announcement")[0];
  const popup = of("popup")[0];
  const countdown = of("countdown")[0];
  const badges = of("badge");
  const base = `/api/app/campaigns/${campaign.id}/blocks`;
  const toggle = (block: CampaignBlockDTO) => (on: boolean) => void save(`${base}/${block.id}`, "PATCH", { enabled: on });
  const removeBlock = (block: CampaignBlockDTO) => async () => {
    if (await confirmDialog({ message: t("blocks.confirmRemove"), tone: "danger" })) void save(`${base}/${block.id}`, "DELETE", undefined);
  };
  const add = (type: string, settings?: Record<string, unknown>) => void save(base, "POST", { type, ...(settings ? { settings } : {}) });
  const popupForm = popup ? campaign.popupForms.find((form) => form.id === popup.settings.formId) : undefined;

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <BlockCard title={t("blocks.announcement")} sub={t("blocks.announcementSub")} block={announcement} onToggle={announcement ? toggle(announcement) : undefined} busy={busy} onRemove={announcement ? removeBlock(announcement) : undefined}>
        {announcement ? <AnnouncementEditor block={announcement} props={props} /> : <PillButton tone="white" size="md" disabled={busy} onClick={() => add("announcement", { messages: [{ text: t("blocks.starterMessage", { countdown: "{countdown}" }), link: "", linkLabel: "" }] })}><Icon name="plus" size={15} /> {t("blocks.addAnnouncement")}</PillButton>}
      </BlockCard>

      <BlockCard title={t("blocks.popup")} sub={t("blocks.popupSub")} block={popup} onToggle={popup ? toggle(popup) : undefined} busy={busy} onRemove={popup ? removeBlock(popup) : undefined}>
        {popup ? (
          <div className="grid gap-3">
            {popupForm ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-app-line px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-bold">{popupForm.name}</span>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    <Pill tone="muted">{t.dynamic(`popupKind.${popupForm.kind}`, popupForm.kind)}</Pill>
                    {!popupForm.active ? <Pill tone="warning">{t("blocks.popupOff")}</Pill> : null}
                  </span>
                </span>
                <Link href={`/home/marketing/forms?edit=${popupForm.id}`} className="inline-flex min-h-[38px] items-center rounded-full border border-app-line px-4 text-[13px] font-bold text-app-ink no-underline hover:border-app-line-strong">{t("blocks.editPopup")}</Link>
              </div>
            ) : (
              <Notice tone="info">{t("blocks.popupMissing")}</Notice>
            )}
            <p className="m-0 text-[12.5px] text-app-ink-soft">{t("blocks.popupRules")}</p>
          </div>
        ) : (
          <div className="grid gap-3">
            <PillButton tone="white" size="md" disabled={busy} onClick={() => add("popup")}><Icon name="plus" size={15} /> {t("blocks.addPopup")}</PillButton>
            {store.popups.length ? (
              <div className="flex flex-wrap items-end gap-2">
                <Field label={t("blocks.usePopup")} className="min-w-[200px] flex-1">
                  <select className={selectClass} value={joinId} onChange={(event) => setJoinId(event.target.value)}>
                    <option value="">{t("blocks.pickPopup")}</option>
                    {store.popups.map((form) => <option key={form.id} value={form.id}>{form.name}</option>)}
                  </select>
                </Field>
                <PillButton tone="white" size="md" disabled={busy || !joinId} onClick={() => add("popup", { formId: joinId })}>{t("blocks.usePopupButton")}</PillButton>
              </div>
            ) : null}
          </div>
        )}
      </BlockCard>

      <BlockCard title={t("blocks.badges")} sub={t("blocks.badgesSub")} busy={busy}>
        <div className="grid gap-4">
          {badges.map((badge) => (
            <div key={badge.id} className="rounded-[18px] border border-app-line p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-[14px] font-extrabold">{readBadgeSettings(badge.settings).label || t("badge.defaultLabel")}</span>
                <span className="flex items-center gap-3">
                  <Toggle on={badge.enabled} onChange={toggle(badge)} label={t("blocks.badges")} />
                  <button type="button" className="text-[12.5px] font-bold text-app-danger underline" onClick={removeBlock(badge)}>{t("blocks.remove")}</button>
                </span>
              </div>
              <BadgeEditor block={badge} props={props} />
            </div>
          ))}
          {badges.length < 3 ? <PillButton tone="white" size="md" disabled={busy} onClick={() => add("badge")}><Icon name="plus" size={15} /> {t("blocks.addBadge")}</PillButton> : null}
          <p className="m-0 text-[12.5px] text-app-ink-soft">{t("blocks.badgesRule")}</p>
        </div>
      </BlockCard>

      <BlockCard title={t("blocks.countdown")} sub={t("blocks.countdownSub")} block={countdown} onToggle={countdown ? toggle(countdown) : undefined} busy={busy} onRemove={countdown ? removeBlock(countdown) : undefined}>
        {countdown ? <CountdownEditor block={countdown} props={props} /> : <PillButton tone="white" size="md" disabled={busy} onClick={() => add("countdown")}><Icon name="plus" size={15} /> {t("blocks.addCountdown")}</PillButton>}
      </BlockCard>
    </div>
  );
}
