"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardHead, Pill } from "@/components/app-kit";
import { DeviceToggle, Notice, PillButton, type PreviewDevice } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { Field, selectClass } from "@/components/growth/kit";
import { Modal } from "@/components/growth/Modal";
import { useT } from "@/components/i18n/I18nProvider";
import { MediaPicker } from "@/components/media/MediaPicker";
import { Inspector, type SectionAction } from "@/components/builder/editor/Inspector";
import { TemplateStorefrontSurface, type SurfaceStore } from "@/components/storefront/TemplateStorefrontSurface";
import { CampaignContext, type CampaignContextValue } from "@/components/storefront/campaign/CampaignContext";
import { newStoreBlockSection } from "@/components/storefront/boutique/blocks/block-catalog";
import { applyCampaignToSnapshot, applySectionOverrides, COLOR_TOKEN_KEYS, type CampaignSectionOverride, type ColorTokenKey } from "@/lib/store-campaigns/merge";
import { CAMPAIGN_SECTION_KINDS } from "@/lib/store-campaigns/presets";
import { readCountdownSettings } from "@/lib/store-campaigns/blocks";
import type { TemplateSectionNode, ThemeTokenSet } from "@/lib/store-templates/types";
import type { EditorProps } from "./editor-shared";
import { uploadToFolder } from "@/components/media/media-client";

// Campaign look: a focused theme panel. Colours, heading font, corners and logo replace the store's own only while
// the campaign runs; on any page the seller can hide, move or change a section for the campaign, or add campaign
// sections (countdown banner, deal grid…). Everything is saved as changes for this campaign: the store's own design
// is never touched, and a preview shows the page exactly as the store will draw it.

const CHROME = ["announcement-bar", "header", "footer"];
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function hex6(value: string | undefined, fallback = "#000000") {
  if (!value) return fallback;
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  if (/^#[0-9a-f]{3}$/i.test(value)) return `#${value.slice(1).split("").map((c) => c + c).join("")}`;
  return fallback;
}

export function LookTab({ campaign, store, save, busy }: EditorProps) {
  const t = useT("campaigns");
  const [tokens, setTokens] = useState<Partial<ThemeTokenSet>>(campaign.themeOverride.tokens);
  const [logoUrl, setLogoUrl] = useState(campaign.themeOverride.logoUrl ?? "");
  const [overrides, setOverrides] = useState<CampaignSectionOverride[]>(campaign.sectionOverrides);
  const [pageType, setPageType] = useState<string>("home");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<"settings" | "style">("settings");
  const [device, setDevice] = useState<PreviewDevice>("mobile");
  const [addKind, setAddKind] = useState<string>(CAMPAIGN_SECTION_KINDS[0]);

  useEffect(() => {
    setTokens(campaign.themeOverride.tokens);
    setLogoUrl(campaign.themeOverride.logoUrl ?? "");
    setOverrides(campaign.sectionOverrides);
  }, [campaign]);

  const snapshot = store.snapshot;
  const page = snapshot?.pages.find((entry) => entry.pageType === pageType) ?? null;
  const pageOverrides = overrides.filter((entry) => entry.page === pageType);
  const merged = useMemo(() => (page ? applySectionOverrides(page.sections ?? [], pageOverrides).sections : []), [page, pageOverrides]);
  const body = merged.filter((section) => !CHROME.includes(section.kind));
  const dirty = JSON.stringify({ tokens, logoUrl, overrides }) !== JSON.stringify({ tokens: campaign.themeOverride.tokens, logoUrl: campaign.themeOverride.logoUrl ?? "", overrides: campaign.sectionOverrides });
  const boutique = store.renderer === "boutique";

  const find = (action: CampaignSectionOverride["action"], id: string) => overrides.find((entry) => entry.page === pageType && entry.action === action && (action === "add" ? entry.section?.id === id : entry.sectionId === id));
  const without = (list: CampaignSectionOverride[], action: CampaignSectionOverride["action"], id: string) => list.filter((entry) => !(entry.page === pageType && entry.action === action && (action === "add" ? entry.section?.id === id : entry.sectionId === id)));

  function toggleHidden(id: string) {
    setOverrides((list) => (find("hide", id) ? without(list, "hide", id) : [...list, { id: newId(), page: pageType, action: "hide", sectionId: id }]));
  }
  function move(id: string, direction: -1 | 1) {
    const at = body.findIndex((section) => section.id === id);
    const neighbour = body[at + direction];
    if (!neighbour) return;
    const position = direction < 0 ? { before: neighbour.id } : { after: neighbour.id };
    setOverrides((list) => [...without(list, "reorder", id), { id: newId(), page: pageType, action: "reorder", sectionId: id, position }]);
  }
  function remove(id: string) {
    setOverrides((list) => without(without(list, "add", id), "reorder", id));
    if (editingId === id) setEditingId(null);
  }
  function changeForCampaign(section: TemplateSectionNode) {
    if (!find("replace", section.id)) {
      const copy = JSON.parse(JSON.stringify({ ...section, visible: true })) as TemplateSectionNode;
      setOverrides((list) => [...list, { id: newId(), page: pageType, action: "replace", sectionId: section.id, section: copy }]);
    }
    setEditingId(section.id);
  }
  function reset(id: string) {
    setOverrides((list) => without(without(without(list, "replace", id), "reorder", id), "hide", id));
    if (editingId === id) setEditingId(null);
  }
  function addSection() {
    const id = `cmp-${newId()}`;
    const section = newStoreBlockSection(addKind, id);
    if (!section) return;
    setOverrides((list) => [...list, { id: newId(), page: pageType, action: "add", section, position: { index: 0 } }]);
    setEditingId(id);
  }

  // The section being edited: an added one, or the campaign's copy of a store section.
  const editingOverride = editingId ? find("add", editingId) ?? find("replace", editingId) : undefined;
  const editingSection = editingOverride?.section ? { ...editingOverride.section, id: editingId! } : null;
  const updateEditing = useCallback(
    (updater: (section: TemplateSectionNode) => TemplateSectionNode) => {
      if (!editingId) return;
      setOverrides((list) =>
        list.map((entry) => {
          const matches = entry.page === pageType && entry.section && ((entry.action === "add" && entry.section.id === editingId) || (entry.action === "replace" && entry.sectionId === editingId));
          return matches ? { ...entry, section: updater(entry.section!) } : entry;
        }),
      );
    },
    [editingId, pageType],
  );

  async function upload(file: File) {
    try {
      return await uploadToFolder(file, "store-banners");
    } catch {
      return null;
    }
  }

  function saveLook() {
    const cleanTokens = Object.fromEntries(Object.entries(tokens).filter(([, value]) => value !== undefined && value !== ""));
    void save(`/api/app/campaigns/${campaign.id}`, "PATCH", { themeOverride: { tokens: cleanTokens, ...(logoUrl ? { logoUrl } : {}) }, sectionOverrides: overrides });
  }

  // Preview: the page as the store draws it with these (unsaved) changes, timers following this campaign.
  const preview = useMemo(() => {
    if (!snapshot) return null;
    return applyCampaignToSnapshot(snapshot, { theme: { tokens, logoUrl: logoUrl || null }, sections: overrides }).snapshot;
  }, [snapshot, tokens, logoUrl, overrides]);
  const surfaceStore: SurfaceStore = useMemo(
    () => ({ name: store.name, slug: store.slug, logoUrl: logoUrl || store.logoUrl, currency: store.products[0]?.currency ?? "NGN", storeProducts: store.products, brandSettings: {} }),
    [store, logoUrl],
  );
  const countdown = readCountdownSettings(campaign.blocks.find((block) => block.type === "countdown")?.settings);
  const context: CampaignContextValue = useMemo(
    () => ({
      slug: store.slug,
      basePath: `/s/${store.slug}`,
      shiftMs: 0,
      view: {
        campaigns: [{ id: campaign.id, name: campaign.name, startsAt: campaign.startsAt, endsAt: campaign.endsAt ?? campaign.suggested?.endsAt ?? null, priority: campaign.priority, timezone: campaign.timezone, discountCode: campaign.discount && !campaign.discount.automatic ? campaign.discount.code : "", countdown: { blockId: null, settings: countdown, target: null } }],
        themeCampaignId: campaign.id,
        announcement: null,
        badges: {},
        preview: null,
        serverNow: Date.now(),
      },
    }),
    [campaign, store.slug, countdown],
  );

  const orphaned = campaign.warnings.orphaned.length;
  const tokenLabel: Record<ColorTokenKey, string> = {
    heroBg: t("token.heroBg"),
    heroText: t("token.heroText"),
    accent: t("token.accent"),
    ctaBg: t("token.ctaBg"),
    ctaText: t("token.ctaText"),
    paperBg: t("token.paperBg"),
    cardBg: t("token.cardBg"),
    ink: t("token.ink"),
    muted: t("token.muted"),
    border: t("token.border"),
  };
  const sectionLabel = (section: TemplateSectionNode) => section.name || section.kind.replace(/-/g, " ");

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-5">
        <Notice tone="info">{t("look.banner", { name: campaign.name })}</Notice>
        {orphaned ? (
          <Notice>
            {t("look.orphaned", { count: orphaned })}{" "}
            <button type="button" className="font-bold underline" onClick={() => setOverrides((list) => list.filter((entry) => !campaign.warnings.orphaned.includes(entry.id)))}>{t("look.removeOrphans")}</button>
          </Notice>
        ) : null}

        <Card className="p-5">
          <CardHead title={t("look.colours")} sub={t("look.coloursSub")} />
          <ul className="m-0 mt-4 grid list-none gap-2.5 p-0 sm:grid-cols-2">
            {COLOR_TOKEN_KEYS.map((key) => {
              const own = tokens[key];
              const base = store.baseTokens?.[key];
              return (
                <li key={key} className="flex items-center gap-3 rounded-[14px] border border-app-line px-3 py-2">
                  <input type="color" aria-label={tokenLabel[key]} value={hex6((own as string | undefined) ?? (base as string | undefined))} onChange={(event) => setTokens((current) => ({ ...current, [key]: event.target.value }))} className="h-9 w-11 shrink-0 cursor-pointer rounded-[8px] border border-app-line bg-white p-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold">{tokenLabel[key]}</span>
                    <span className="block text-[12px] text-app-ink-soft">{own ? t("look.campaignColour") : t("look.storeColour")}</span>
                  </span>
                  {own ? (
                    <button type="button" className="shrink-0 text-[12.5px] font-bold text-app-accent-ink underline" onClick={() => setTokens((current) => { const next = { ...current }; delete next[key]; return next; })}>{t("look.reset")}</button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={t("look.headings")} htmlFor="look-headings">
              <select id="look-headings" className={selectClass} value={tokens.headingStyle ?? ""} onChange={(event) => setTokens((current) => { const next = { ...current }; if (event.target.value) next.headingStyle = event.target.value as ThemeTokenSet["headingStyle"]; else delete next.headingStyle; return next; })}>
                <option value="">{t("look.storeOwn")}</option>
                <option value="serif">{t("look.serif")}</option>
                <option value="grotesk">{t("look.modern")}</option>
              </select>
            </Field>
            <Field label={t("look.corners")} htmlFor="look-corners">
              <select id="look-corners" className={selectClass} value={tokens.radius ?? ""} onChange={(event) => setTokens((current) => { const next = { ...current }; if (event.target.value) next.radius = event.target.value as ThemeTokenSet["radius"]; else delete next.radius; return next; })}>
                <option value="">{t("look.storeOwn")}</option>
                <option value="soft">{t("look.soft")}</option>
                <option value="rounded">{t("look.rounded")}</option>
                <option value="sharp">{t("look.sharp")}</option>
              </select>
            </Field>
          </div>
          <div className="mt-4">
            <MediaPicker value={logoUrl} onChange={(url) => setLogoUrl(url)} label={t("look.logo")} help={t("look.logoHint")} shape="square" compact />
          </div>
        </Card>

        <Card className="p-5">
          <CardHead
            title={t("look.sections")}
            sub={t("look.sectionsSub")}
            action={
              snapshot && snapshot.pages.length > 1 ? (
                <select aria-label={t("look.page")} className={`${selectClass} h-[40px] w-auto`} value={pageType} onChange={(event) => { setPageType(event.target.value); setEditingId(null); }}>
                  {snapshot.pages.map((entry) => <option key={entry.pageType} value={entry.pageType}>{entry.title || entry.pageType}</option>)}
                </select>
              ) : undefined
            }
          />
          {!snapshot ? (
            <p className="m-0 mt-3 text-[14px] text-app-ink-soft">{t("look.noDesign")}</p>
          ) : (
            <>
              <ol className="m-0 mt-4 grid list-none gap-2 p-0">
                {body.map((section, index) => {
                  const added = Boolean(find("add", section.id));
                  const changed = Boolean(find("replace", section.id));
                  const hidden = Boolean(find("hide", section.id));
                  const moved = Boolean(find("reorder", section.id));
                  return (
                    <li key={section.id} className={`flex flex-wrap items-center gap-2 rounded-[14px] border px-3 py-2.5 ${hidden ? "border-dashed border-app-line opacity-60" : "border-app-line"}`}>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-[14px] font-bold">{sectionLabel(section)}</span>
                          {added ? <Pill tone="success">{t("look.added")}</Pill> : null}
                          {changed ? <Pill tone="accent" dot>{t("look.changed")}</Pill> : null}
                          {hidden ? <Pill tone="muted">{t("look.hidden")}</Pill> : null}
                          {moved && !added ? <Pill tone="info">{t("look.moved")}</Pill> : null}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-app-canvas disabled:opacity-30" aria-label={t("look.moveUp", { name: sectionLabel(section) })} disabled={index === 0} onClick={() => move(section.id, -1)}><Icon name="arrowUp" size={15} /></button>
                        <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-app-canvas disabled:opacity-30" aria-label={t("look.moveDown", { name: sectionLabel(section) })} disabled={index === body.length - 1} onClick={() => move(section.id, 1)}><Icon name="arrowDown" size={15} /></button>
                        {added ? (
                          <>
                            <button type="button" className="rounded-full px-3 py-1.5 text-[13px] font-bold hover:bg-app-canvas" onClick={() => setEditingId(section.id)}>{t("look.edit")}</button>
                            <button type="button" className="rounded-full px-3 py-1.5 text-[13px] font-bold text-app-danger hover:bg-app-canvas" onClick={() => remove(section.id)}>{t("look.remove")}</button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="rounded-full px-3 py-1.5 text-[13px] font-bold hover:bg-app-canvas" onClick={() => toggleHidden(section.id)}>{hidden ? t("look.unhide") : t("look.hide")}</button>
                            <button type="button" className="rounded-full px-3 py-1.5 text-[13px] font-bold hover:bg-app-canvas" onClick={() => changeForCampaign(section)}>{t("look.change")}</button>
                            {changed || moved || hidden ? <button type="button" className="rounded-full px-3 py-1.5 text-[13px] font-bold text-app-accent-ink hover:bg-app-canvas" onClick={() => reset(section.id)}>{t("look.resetSection")}</button> : null}
                          </>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
              {boutique ? (
                <div className="mt-4 flex flex-wrap items-end gap-2">
                  <Field label={t("look.addSection")} htmlFor="look-add" className="min-w-[200px] flex-1">
                    <select id="look-add" className={selectClass} value={addKind} onChange={(event) => setAddKind(event.target.value)}>
                      {CAMPAIGN_SECTION_KINDS.map((kind) => <option key={kind} value={kind}>{t.dynamic(`kind.${kind}`, kind)}</option>)}
                    </select>
                  </Field>
                  <PillButton tone="white" size="md" onClick={addSection}><Icon name="plus" size={15} /> {t("look.addButton")}</PillButton>
                </div>
              ) : (
                <p className="m-0 mt-4 text-[13px] text-app-ink-soft">{t("look.classicNote")}</p>
              )}
            </>
          )}
        </Card>

        <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-[18px] border border-app-line bg-white/95 p-3 shadow-sm backdrop-blur">
          <PillButton tone="ink" size="md" disabled={busy || !dirty} busy={busy} onClick={saveLook}>{t("look.save")}</PillButton>
          <span className="text-[13px] text-app-ink-soft">{dirty ? t("look.unsaved") : t("look.allSaved")}</span>
        </div>
      </div>

      <div className="grid content-start gap-3 xl:sticky xl:top-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-[16px] font-extrabold">{t("look.preview")}</h2>
          <DeviceToggle value={device} onChange={setDevice} size="sm" />
        </div>
        <div className="overflow-hidden rounded-[18px] border border-app-line bg-app-canvas">
          {preview ? (
            <div className="mx-auto max-h-[760px] overflow-y-auto bg-white" style={{ maxWidth: device === "mobile" ? 390 : "100%", pointerEvents: "none" }} aria-label={t("look.previewAria")}>
              <CampaignContext.Provider value={context}>
                <TemplateStorefrontSurface store={surfaceStore} snapshot={preview} storeBasePath={`/s/${store.slug}`} mode="editor" device={device === "mobile" ? "mobile" : "desktop"} selectedPage={pageType} />
              </CampaignContext.Provider>
            </div>
          ) : (
            <p className="m-0 p-6 text-[14px] text-app-ink-soft">{t("look.noDesign")}</p>
          )}
        </div>
        <p className="m-0 text-[12.5px] text-app-ink-soft">{t("look.previewNote")}</p>
      </div>

      {editingSection ? (
        <Modal title={sectionLabel(editingSection)} onClose={() => setEditingId(null)} wide>
          <div className="h-[70dvh] overflow-hidden">
            <Inspector
              section={editingSection}
              page={null}
              renderer={store.renderer}
              themeId={store.themeId}
              storeName={store.name}
              storeHost={store.host}
              products={store.products}
              collections={store.collections}
              pageTypes={snapshot?.pages.map((entry) => entry.pageType) ?? []}
              tab={inspectorTab}
              onTab={setInspectorTab}
              focusField={null}
              onFocusHandled={() => undefined}
              onChange={(updater) => updateEditing(updater)}
              onChangePage={() => undefined}
              onAction={(action: SectionAction) => {
                if (action === "remove") { if (find("add", editingSection.id)) remove(editingSection.id); else reset(editingSection.id); }
                else if (action === "up") move(editingSection.id, -1);
                else if (action === "down") move(editingSection.id, 1);
                else if (action === "hide" && !find("add", editingSection.id)) toggleHidden(editingSection.id);
              }}
              canMove={{ up: body[0]?.id !== editingSection.id, down: body[body.length - 1]?.id !== editingSection.id, duplicate: false }}
              onUpload={upload}
              onOpenThemeSettings={() => setEditingId(null)}
              onAddBlock={() => undefined}
              onClose={() => setEditingId(null)}
            />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
