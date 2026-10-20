import "server-only";
import { seasonalCampaignProblem } from "@/lib/plans/gates.server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { PAID_ORDER_STATUSES } from "@/lib/insights";
import { parseDiscountConfig } from "@/lib/discounts";
import { popupTemplate, readPopupConfig } from "@/lib/marketing/forms";
import { readCountdownEnd } from "@/lib/store-templates/section-content";
import type { StoreEditorSnapshot } from "@/lib/store-templates/types";
import { notify } from "@/lib/notifications/notify.server";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { paydayWindow, readPaydaySettings } from "@/lib/storefront/shopper-info";
import {
  computeCampaignStatus,
  dueCampaignJobs,
  discountDatesMismatch,
  jobResetsForNewDates,
  overlappingCampaigns,
  startWasMissed,
  toMs,
  type CampaignJob,
} from "./status";
import { orphanedOverrides, readSectionOverrides, readThemeOverride, type CampaignSectionOverride } from "./merge";
import { BLOCK_TYPES, badgeMatches, readAnnouncementSettings, readBadgeSettings, readCountdownSettings, readPopupBlockSettings, type CampaignBlockType } from "./blocks";
import { campaignPreset, firstHeroSectionId, presetBlocks, presetSectionOverrides, suggestedPresetDates, type CampaignPreset } from "./presets";
import { DEFAULT_CAMPAIGN_TIME_ZONE, safeTimeZone } from "./time";
import { PREVIEW_PARAM, PREVIEW_TOKEN_PARAM, signPreviewToken } from "./preview-token";
import type { BackendCountdown, CampaignAnalytics, CampaignBlockDTO, CampaignDetail, CampaignDiscountSummary, CampaignSummary } from "./types";

// Seasonal campaigns for the seller backend: list, create (blank or from a preset), edit, lifecycle actions, blocks,
// preview links, the scheduler's side effects and the report. Every function takes the seller's own store, so a
// seller can only ever reach their own campaigns. The storefront side is storefront.server.ts.

export class CampaignError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

const DETAIL_INCLUDE = {
  discount: { select: { id: true, name: true, code: true, status: true, startsAt: true, expiresAt: true, config: true } },
  blocks: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] },
} satisfies Prisma.StoreCampaignInclude;

type CampaignRow = Prisma.StoreCampaignGetPayload<{ include: typeof DETAIL_INCLUDE }>;

const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null);
const json = (value: unknown) => value as Prisma.InputJsonValue;

export function rowHasOverrides(row: { themeOverride: unknown; sectionOverrides: unknown }) {
  const theme = readThemeOverride(row.themeOverride);
  return Object.keys(theme.tokens).length > 0 || Boolean(theme.logoUrl) || readSectionOverrides(row.sectionOverrides).length > 0;
}

function discountSummary(discount: CampaignRow["discount"]): CampaignDiscountSummary | null {
  if (!discount) return null;
  return {
    id: discount.id,
    name: discount.name,
    code: discount.code,
    status: discount.status,
    automatic: parseDiscountConfig(discount.config).automatic,
    startsAt: iso(discount.startsAt),
    expiresAt: iso(discount.expiresAt),
  };
}

function summarize(row: CampaignRow, revenue: number, now: number): CampaignSummary {
  const types = new Set<CampaignBlockType>();
  for (const block of row.blocks) if (block.enabled && (BLOCK_TYPES as readonly string[]).includes(block.type)) types.add(block.type as CampaignBlockType);
  return {
    id: row.id,
    name: row.name,
    preset: row.preset,
    startsAt: iso(row.startsAt),
    endsAt: iso(row.endsAt),
    timezone: row.timezone,
    priority: row.priority,
    pausedAt: iso(row.pausedAt),
    archivedAt: iso(row.archivedAt),
    endingSoonHours: row.endingSoonHours,
    discountId: row.discountId,
    discountAutoToggle: row.discountAutoToggle,
    status: computeCampaignStatus(row, now),
    discount: discountSummary(row.discount),
    blockTypes: [...types],
    hasOverrides: rowHasOverrides(row),
    revenue,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function blockDto(block: CampaignRow["blocks"][number]): CampaignBlockDTO {
  const obj = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
  return { id: block.id, type: block.type as CampaignBlockType, enabled: block.enabled, settings: obj(block.settings), targeting: obj(block.targeting), sortOrder: block.sortOrder };
}

/** Paid sales inside each campaign's window so far, in one query. */
async function revenueByCampaign(storeId: string, now: Date): Promise<Map<string, number>> {
  const rows = await db
    .$queryRaw<Array<{ id: string; revenue: number | null }>>`
      SELECT c."id", COALESCE(SUM(o."total"), 0)::float AS revenue
      FROM "StoreCampaign" c
      JOIN "RetailOrder" o ON o."storeId" = c."storeId"
        AND o."createdAt" >= c."startsAt"
        AND o."createdAt" < LEAST(c."endsAt", ${now})
        AND o."status"::text = ANY(${[...PAID_ORDER_STATUSES]}::text[])
      WHERE c."storeId" = ${storeId} AND c."startsAt" IS NOT NULL AND c."startsAt" <= ${now}
      GROUP BY c."id"`
    .catch(() => []);
  return new Map(rows.map((row) => [row.id, Number(row.revenue ?? 0)]));
}

export async function listCampaigns(storeId: string, now = new Date()): Promise<CampaignSummary[]> {
  const [rows, revenue] = await Promise.all([
    db.storeCampaign.findMany({ where: { storeId }, include: DETAIL_INCLUDE, orderBy: [{ startsAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }], take: 300 }),
    revenueByCampaign(storeId, now),
  ]);
  return rows.map((row) => summarize(row, revenue.get(row.id) ?? 0, now.getTime()));
}

function publishedSnapshot(brandSettings: unknown): StoreEditorSnapshot | null {
  const settings = brandSettings && typeof brandSettings === "object" ? (brandSettings as Record<string, unknown>) : {};
  const editor = settings.editor && typeof settings.editor === "object" ? (settings.editor as Record<string, unknown>) : {};
  const published = editor.published as StoreEditorSnapshot | undefined;
  return published && Array.isArray(published.pages) ? published : null;
}

export interface SellerStore {
  id: string;
  name: string;
  slug: string;
  customDomain: string | null;
  brandSettings: unknown;
  userId: string;
}

/** New campaigns come with Growth and up (shared/plans.ts); ones already made keep running after a downgrade. */
async function requireCampaignPlan(store: SellerStore) {
  const problem = await seasonalCampaignProblem(store.userId);
  if (problem) throw new CampaignError(problem, 402);
}

export async function sellerStoreFor(userId: string): Promise<SellerStore | null> {
  return db.store.findUnique({ where: { userId }, select: { id: true, name: true, slug: true, customDomain: true, brandSettings: true, userId: true } });
}

async function findOwn(store: SellerStore, id: string) {
  const row = await db.storeCampaign.findFirst({ where: { id, storeId: store.id }, include: DETAIL_INCLUDE });
  if (!row) throw new CampaignError("Campaign not found", 404);
  return row;
}

export async function campaignDetail(store: SellerStore, id: string, now = new Date()): Promise<CampaignDetail> {
  const row = await findOwn(store, id);
  const [others, revenue, forms] = await Promise.all([
    db.storeCampaign.findMany({
      where: { storeId: store.id, id: { not: row.id }, archivedAt: null, startsAt: { not: null }, endsAt: { not: null } },
      select: { id: true, name: true, priority: true, startsAt: true, endsAt: true, archivedAt: true, themeOverride: true, sectionOverrides: true },
      take: 200,
    }),
    revenueByCampaign(store.id, now),
    campaignPopupForms(store.id, row),
  ]);
  const overlaps = overlappingCampaigns(row, others.map((other) => ({ ...other, hasOverrides: rowHasOverrides(other) }))).map((other) => ({ id: other.id, name: other.name, priority: other.priority }));
  const sectionOverrides = readSectionOverrides(row.sectionOverrides);
  const entry = !row.startsAt && row.preset ? campaignPreset(row.preset) : null;
  const dates = entry ? suggestedPresetDates(entry.id, safeTimeZone(row.timezone), now.getTime()) : null;
  return {
    ...summarize(row, revenue.get(row.id) ?? 0, now.getTime()),
    suggested: dates ? { startsAt: new Date(dates.startsAt).toISOString(), endsAt: new Date(dates.endsAt).toISOString() } : null,
    themeOverride: readThemeOverride(row.themeOverride),
    sectionOverrides,
    blocks: row.blocks.map(blockDto),
    popupForms: forms,
    warnings: {
      overlaps: rowHasOverrides(row) ? overlaps : [],
      discountMismatch: discountDatesMismatch(row, row.discount),
      orphaned: orphanedOverrides(publishedSnapshot(store.brandSettings), sectionOverrides),
    },
  };
}

async function campaignPopupForms(storeId: string, row: CampaignRow) {
  const ids = row.blocks.filter((block) => block.type === "popup").map((block) => readPopupBlockSettings(block.settings).formId).filter((id): id is string => Boolean(id));
  if (!ids.length) return [];
  const forms = await db.storeForm.findMany({ where: { storeId, id: { in: ids } }, select: { id: true, name: true, popupConfig: true, active: true } });
  return forms.map((form) => ({ id: form.id, name: form.name, kind: readPopupConfig(form.popupConfig).kind, active: form.active }));
}

// ─── Create, duplicate ────────────────────────────────────────────────────────

/** A store pop-up (Marketing > Forms and pop-ups) for the campaign: a sale pop-up with its countdown, shown only while it runs. */
async function createPopupForm(storeId: string, campaign: { id: string; name: string; endsAt: Date | null }, entry: CampaignPreset | null, t: Translate) {
  const spec = entry?.popup ?? null;
  const template = popupTemplate(spec?.template ?? "weekend_sale");
  const design = {
    eyebrow: spec ? t(spec.eyebrowKey) : t("popup.defaultEyebrow"),
    headline: spec ? t(spec.headlineKey) : campaign.name,
    body: spec ? t(spec.bodyKey) : t("popup.defaultBody"),
    buttonText: spec ? t(spec.ctaKey) : t("popup.cta"),
    ctaLabel: spec ? t(spec.ctaKey) : t("popup.cta"),
    ctaTarget: "shop",
    ctaUrl: "",
    successMessage: "",
    style: template.style,
  };
  const form = await db.storeForm.create({
    data: {
      storeId,
      name: t("popup.formName", { name: campaign.name }).slice(0, 120),
      type: "popup",
      isPopup: true,
      active: true,
      fields: json([]),
      design: json(design),
      actions: json([{ type: "add_subscriber" }]),
      popupConfig: json({
        layout: template.layout === "bar" ? "modal" : template.layout,
        kind: "countdown",
        trigger: spec?.trigger ?? "exit_intent",
        delaySeconds: 8,
        scrollPercent: 50,
        pages: "all",
        frequency: "session",
        frequencyDays: 7,
        devices: ["mobile", "desktop"],
        afterSubmit: "message",
        endsAt: iso(campaign.endsAt),
        campaignId: campaign.id,
        reward: null,
      }),
    },
    select: { id: true },
  });
  return form.id;
}

export async function createCampaign(store: SellerStore, input: { preset?: string; name?: string }, t: Translate, now = new Date()): Promise<CampaignDetail> {
  await requireCampaignPlan(store);
  const entry = campaignPreset(input.preset ?? "blank");
  const zone = DEFAULT_CAMPAIGN_TIME_ZONE;
  const dates = entry ? suggestedPresetDates(entry.id, zone, now.getTime()) : null;
  const year = dates ? new Date(dates.startsAt).getUTCFullYear() : now.getUTCFullYear();
  const name = input.name?.trim() || (entry && entry.id !== "blank" ? t("preset.nameWithYear", { name: t(entry.nameKey), year: String(year) }) : t("newCampaignName"));
  const snapshot = publishedSnapshot(store.brandSettings);
  const home = snapshot?.pages.find((page) => page.pageType === "home") ?? null;
  const stamp = now.getTime().toString(36);
  const sectionOverrides: CampaignSectionOverride[] = entry ? presetSectionOverrides(entry, (key) => t(key), (n) => `${stamp}${n}`, firstHeroSectionId(home)) : [];

  const created = await db.storeCampaign.create({
    data: {
      storeId: store.id,
      name: name.slice(0, 120),
      preset: entry && entry.id !== "blank" ? entry.id : null,
      timezone: zone,
      priority: entry?.priority ?? 0,
      endingSoonHours: entry?.endingSoonHours ?? 24,
      themeOverride: json({ tokens: entry?.tokens ?? {} }),
      sectionOverrides: json(sectionOverrides),
      // Suggested dates are filled in, but the campaign stays a draft until the seller schedules it.
      startsAt: null,
      endsAt: null,
      blocks: entry ? { create: presetBlocks(entry, (key, vars) => t(key, vars)).map((block, at) => ({ type: block.type, settings: json(block.settings), sortOrder: at })) } : undefined,
    },
    select: { id: true, name: true, endsAt: true },
  });
  if (entry?.popup) {
    const formId = await createPopupForm(store.id, created, entry, t);
    await db.storeCampaignBlock.create({ data: { campaignId: created.id, type: "popup", settings: json({ formId }), sortOrder: 10 } });
  }
  return campaignDetail(store, created.id, now);
}

export async function duplicateCampaign(store: SellerStore, id: string, t: Translate): Promise<CampaignDetail> {
  await requireCampaignPlan(store);
  const row = await findOwn(store, id);
  const copy = await db.storeCampaign.create({
    data: {
      storeId: store.id,
      name: t("copyName", { name: row.name }).slice(0, 120),
      preset: row.preset,
      timezone: row.timezone,
      priority: row.priority,
      endingSoonHours: row.endingSoonHours,
      discountId: row.discountId,
      discountAutoToggle: row.discountAutoToggle,
      themeOverride: json(row.themeOverride),
      sectionOverrides: json(row.sectionOverrides),
    },
    select: { id: true, name: true, endsAt: true },
  });
  for (const block of row.blocks) {
    let settings = block.settings as Record<string, unknown>;
    if (block.type === "popup") {
      const formId = readPopupBlockSettings(block.settings).formId;
      const form = formId ? await db.storeForm.findFirst({ where: { id: formId, storeId: store.id } }) : null;
      if (form) {
        const config = { ...(form.popupConfig as Record<string, unknown>), campaignId: copy.id, endsAt: null };
        const clone = await db.storeForm.create({
          data: { storeId: store.id, name: t("popup.formName", { name: copy.name }).slice(0, 120), type: form.type, isPopup: true, active: form.active, fields: json(form.fields), design: json(form.design), actions: json(form.actions), popupConfig: json(config) },
          select: { id: true },
        });
        settings = { formId: clone.id };
      } else {
        settings = { formId: null };
      }
    }
    await db.storeCampaignBlock.create({ data: { campaignId: copy.id, type: block.type, enabled: block.enabled, settings: json(settings), targeting: json(block.targeting), sortOrder: block.sortOrder } });
  }
  return campaignDetail(store, copy.id);
}

// ─── Edit ─────────────────────────────────────────────────────────────────────

export interface CampaignPatch {
  name?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  timezone?: string;
  priority?: number;
  endingSoonHours?: number;
  discountId?: string | null;
  discountAutoToggle?: boolean;
  themeOverride?: Record<string, unknown>;
  sectionOverrides?: unknown[];
}

export async function updateCampaign(store: SellerStore, id: string, patch: CampaignPatch, now = new Date()): Promise<CampaignDetail> {
  const row = await findOwn(store, id);
  const data: Prisma.StoreCampaignUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name.slice(0, 120);
  if (patch.timezone !== undefined) data.timezone = safeTimeZone(patch.timezone);
  if (patch.priority !== undefined) data.priority = patch.priority;
  if (patch.endingSoonHours !== undefined) data.endingSoonHours = patch.endingSoonHours;
  if (patch.discountAutoToggle !== undefined) data.discountAutoToggle = patch.discountAutoToggle;
  if (patch.discountId !== undefined) {
    if (patch.discountId) {
      const discount = await db.discount.findFirst({ where: { id: patch.discountId, storeId: store.id }, select: { id: true } });
      if (!discount) throw new CampaignError("That discount isn't in your store");
      data.discount = { connect: { id: discount.id } };
    } else {
      data.discount = { disconnect: true };
    }
  }
  if (patch.themeOverride !== undefined) data.themeOverride = json(readThemeOverride(patch.themeOverride));
  if (patch.sectionOverrides !== undefined) data.sectionOverrides = json(readSectionOverrides(patch.sectionOverrides));

  const datesChanged = patch.startsAt !== undefined || patch.endsAt !== undefined;
  if (datesChanged) {
    const startsAt = patch.startsAt !== undefined ? (patch.startsAt ? new Date(patch.startsAt) : null) : row.startsAt;
    const endsAt = patch.endsAt !== undefined ? (patch.endsAt ? new Date(patch.endsAt) : null) : row.endsAt;
    if ((startsAt === null) !== (endsAt === null)) throw new CampaignError("Pick both a start and an end, or neither");
    if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) throw new CampaignError("The end must be after the start");
    data.startsAt = startsAt;
    data.endsAt = endsAt;
    // New dates: the start and end side effects run again for the new window.
    const resets = jobResetsForNewDates({ startsAt, endsAt }, now.getTime());
    if (resets.startJobRanAt || !startsAt) data.startJobRanAt = null;
    if (resets.endJobRanAt || !endsAt) data.endJobRanAt = null;
    if (resets.endingSoonSentAt || !endsAt) data.endingSoonSentAt = null;
  }
  await db.storeCampaign.update({ where: { id: row.id }, data });
  if (datesChanged) await runJobsForCampaign(row.id, now);
  return campaignDetail(store, row.id, now);
}

export type CampaignAction = "pause" | "resume" | "end-now" | "archive" | "unarchive";

export async function campaignAction(store: SellerStore, id: string, action: CampaignAction, now = new Date()): Promise<CampaignDetail> {
  const row = await findOwn(store, id);
  const status = computeCampaignStatus(row, now.getTime());
  switch (action) {
    case "pause":
      if (!["live", "ending_soon", "scheduled"].includes(status)) throw new CampaignError("Only a live or scheduled campaign can be paused");
      await db.storeCampaign.update({ where: { id: row.id }, data: { pausedAt: now } });
      if (row.discountAutoToggle && row.discountId && row.startJobRanAt) await setDiscount(row.discountId, false);
      break;
    case "resume":
      if (status !== "paused") throw new CampaignError("This campaign isn't paused");
      await db.storeCampaign.update({ where: { id: row.id }, data: { pausedAt: null } });
      if (row.discountAutoToggle && row.discountId && row.startJobRanAt && toMs(row.startsAt)! <= now.getTime()) await setDiscount(row.discountId, true);
      break;
    case "end-now": {
      if (!["live", "ending_soon", "paused"].includes(status) || (toMs(row.startsAt) ?? Infinity) > now.getTime()) throw new CampaignError("Only a campaign that has started can be ended");
      // The end must stay after the start (a campaign that started this very second ends a second later).
      const endsAt = new Date(Math.max(now.getTime(), (toMs(row.startsAt) ?? 0) + 1000));
      await db.storeCampaign.update({ where: { id: row.id }, data: { endsAt, pausedAt: null } });
      break;
    }
    case "archive":
      await db.storeCampaign.update({ where: { id: row.id }, data: { archivedAt: now } });
      // Archiving a running campaign switches its discount off like an ending would (once).
      if (row.startJobRanAt && !row.endJobRanAt) {
        const claimed = await db.storeCampaign.updateMany({ where: { id: row.id, endJobRanAt: null }, data: { endJobRanAt: now } });
        if (claimed.count && row.discountAutoToggle && row.discountId) await setDiscount(row.discountId, false);
      }
      break;
    case "unarchive":
      await db.storeCampaign.update({ where: { id: row.id }, data: { archivedAt: null } });
      break;
  }
  await runJobsForCampaign(row.id, now);
  return campaignDetail(store, row.id, now);
}

export async function deleteCampaign(store: SellerStore, id: string) {
  const row = await findOwn(store, id);
  const status = computeCampaignStatus(row);
  if (status !== "draft" && status !== "archived" && status !== "ended") throw new CampaignError("Pause or archive a live campaign before deleting it");
  const formIds = row.blocks.filter((block) => block.type === "popup").map((block) => readPopupBlockSettings(block.settings).formId).filter((formId): formId is string => Boolean(formId));
  await db.$transaction([
    // Only the campaign's own pop-ups (made for it) go with it.
    db.storeForm.deleteMany({ where: { storeId: store.id, id: { in: formIds }, popupConfig: { path: ["campaignId"], equals: row.id } } }),
    db.storeCampaign.delete({ where: { id: row.id } }),
  ]);
}

// ─── Blocks ───────────────────────────────────────────────────────────────────

const SINGLE_BLOCKS: CampaignBlockType[] = ["announcement", "popup", "countdown"];

function cleanBlockSettings(type: CampaignBlockType, raw: unknown): Record<string, unknown> {
  switch (type) {
    case "announcement":
      return { ...readAnnouncementSettings(raw) };
    case "badge":
      return { ...readBadgeSettings(raw) };
    case "countdown":
      return { ...readCountdownSettings(raw) };
    case "popup":
      return { ...readPopupBlockSettings(raw) };
  }
}

export async function addBlock(store: SellerStore, campaignId: string, input: { type: CampaignBlockType; enabled?: boolean; settings?: Record<string, unknown> }, t: Translate) {
  const row = await findOwn(store, campaignId);
  if (SINGLE_BLOCKS.includes(input.type) && row.blocks.some((block) => block.type === input.type)) throw new CampaignError("This campaign already has one of these");
  if (input.type === "badge" && row.blocks.filter((block) => block.type === "badge").length >= 3) throw new CampaignError("A campaign can have up to 3 badges");
  let settings = cleanBlockSettings(input.type, input.settings ?? {});
  if (input.type === "popup") {
    const wanted = readPopupBlockSettings(input.settings).formId;
    const existing = wanted ? await db.storeForm.findFirst({ where: { id: wanted, storeId: store.id, isPopup: true }, select: { id: true, popupConfig: true } }) : null;
    if (existing) {
      // An existing pop-up joins the campaign: it only shows while the campaign runs.
      await db.storeForm.update({ where: { id: existing.id }, data: { popupConfig: json({ ...(existing.popupConfig as Record<string, unknown>), campaignId: row.id }) } });
      settings = { formId: existing.id };
    } else {
      settings = { formId: await createPopupForm(store.id, row, campaignPreset(row.preset), t) };
    }
  }
  if (input.type === "badge" && !settings.label) settings.label = t("badge.defaultLabel");
  await db.storeCampaignBlock.create({ data: { campaignId: row.id, type: input.type, enabled: input.enabled ?? true, settings: json(settings), sortOrder: row.blocks.length } });
  return campaignDetail(store, row.id);
}

export async function updateBlock(store: SellerStore, campaignId: string, blockId: string, input: { enabled?: boolean; settings?: Record<string, unknown>; targeting?: Record<string, unknown> }) {
  const row = await findOwn(store, campaignId);
  const block = row.blocks.find((entry) => entry.id === blockId);
  if (!block) throw new CampaignError("Block not found", 404);
  const type = block.type as CampaignBlockType;
  const data: Prisma.StoreCampaignBlockUpdateInput = {};
  if (input.enabled !== undefined) data.enabled = input.enabled;
  // The pop-up block always points at its own pop-up; its design is edited in Marketing > Forms and pop-ups.
  if (input.settings !== undefined && type !== "popup") data.settings = json(cleanBlockSettings(type, input.settings));
  if (input.targeting !== undefined) data.targeting = json(input.targeting);
  await db.storeCampaignBlock.update({ where: { id: block.id }, data });
  return campaignDetail(store, row.id);
}

export async function deleteBlock(store: SellerStore, campaignId: string, blockId: string) {
  const row = await findOwn(store, campaignId);
  const block = row.blocks.find((entry) => entry.id === blockId);
  if (!block) throw new CampaignError("Block not found", 404);
  if (block.type === "popup") {
    const formId = readPopupBlockSettings(block.settings).formId;
    // A pop-up made for the campaign goes with it; an existing pop-up that joined it goes back to normal.
    if (formId) {
      const form = await db.storeForm.findFirst({ where: { id: formId, storeId: store.id }, select: { id: true, popupConfig: true, name: true } });
      const config = (form?.popupConfig ?? {}) as Record<string, unknown>;
      if (form && config.campaignId === row.id) {
        const { campaignId: _drop, ...rest } = config;
        void _drop;
        await db.storeForm.update({ where: { id: form.id }, data: { popupConfig: json(rest), active: false } });
      }
    }
  }
  await db.storeCampaignBlock.delete({ where: { id: block.id } });
  return campaignDetail(store, row.id);
}

// ─── Preview links ────────────────────────────────────────────────────────────

/** The server secret preview links are signed with (the same secrets other signed links fall back to). */
export function previewSecret() {
  return process.env.CAMPAIGN_PREVIEW_SECRET || process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

export async function campaignPreviewLink(store: SellerStore, id: string, at?: string | null) {
  const row = await findOwn(store, id);
  const secret = previewSecret();
  if (!secret) throw new CampaignError("Preview links aren't set up on this server", 503);
  const token = signPreviewToken({ campaignId: row.id, storeId: store.id }, secret);
  const params = new URLSearchParams({ [PREVIEW_PARAM]: row.id, [PREVIEW_TOKEN_PARAM]: token });
  if (at && Number.isFinite(Date.parse(at))) params.set("preview_at", new Date(Date.parse(at)).toISOString());
  const base = buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain }).replace(/\/$/, "");
  return { url: `${base}/?${params.toString()}`, path: `/s/${store.slug}?${params.toString()}`, expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() };
}

// ─── Scheduler side effects ───────────────────────────────────────────────────

async function setDiscount(discountId: string, on: boolean) {
  await db.discount.update({ where: { id: discountId }, data: { status: on ? "active" : "disabled" } }).catch((error) => console.error("[campaigns] discount switch failed", error));
}

async function windowSales(storeId: string, from: Date, to: Date) {
  const result = await db.retailOrder.aggregate({
    where: { storeId, createdAt: { gte: from, lt: to }, status: { in: [...PAID_ORDER_STATUSES] } },
    _count: true,
    _sum: { total: true },
  });
  return { orders: result._count, revenue: result._sum.total ?? 0 };
}

function naira(amount: number) {
  return `₦${Math.round(amount).toLocaleString("en-NG")}`;
}

type JobRow = Prisma.StoreCampaignGetPayload<{ include: { store: { select: { userId: true; id: true } } } }>;

async function runJob(row: JobRow, job: CampaignJob, now: Date) {
  const link = `/home/campaigns/${row.id}`;
  if (job === "start") {
    // Claim the job first: a second run (or a parallel one) finds it taken and does nothing.
    const claimed = await db.storeCampaign.updateMany({ where: { id: row.id, startJobRanAt: null }, data: { startJobRanAt: now } });
    if (!claimed.count) return;
    if (row.discountAutoToggle && row.discountId) await setDiscount(row.discountId, true);
    await notify({
      userId: row.store.userId,
      event: "store_campaign.live",
      type: "marketing",
      priority: "success",
      title: `${row.name} is now live`,
      description: "Your store is showing the campaign. It switches back by itself when the campaign ends.",
      link,
      actionLabel: "See campaign",
      metadata: { campaignId: row.id },
      dedupeKey: `store_campaign.live:${row.id}:${row.startsAt?.toISOString()}`,
    }).catch(() => null);
    return;
  }
  if (job === "ending_soon") {
    const claimed = await db.storeCampaign.updateMany({ where: { id: row.id, endingSoonSentAt: null }, data: { endingSoonSentAt: now } });
    if (!claimed.count) return;
    const hours = Math.max(1, Math.round(((toMs(row.endsAt) ?? now.getTime()) - now.getTime()) / 3_600_000));
    await notify({
      userId: row.store.userId,
      event: "store_campaign.ending_soon",
      type: "marketing",
      priority: "info",
      title: `${row.name} ends in about ${hours} hour${hours === 1 ? "" : "s"}`,
      description: "Share it on WhatsApp and your Status for a last push.",
      link,
      actionLabel: "See campaign",
      metadata: { campaignId: row.id },
      dedupeKey: `store_campaign.ending_soon:${row.id}:${row.endsAt?.toISOString()}`,
    }).catch(() => null);
    return;
  }
  // End: a campaign whose whole window was missed is marked started too, without a "now live" message.
  const missedStart = startWasMissed(row, now.getTime());
  const claimed = await db.storeCampaign.updateMany({ where: { id: row.id, endJobRanAt: null }, data: { endJobRanAt: now, ...(missedStart ? { startJobRanAt: now } : {}) } });
  if (!claimed.count) return;
  if (row.discountAutoToggle && row.discountId) await setDiscount(row.discountId, false);
  const sales = row.startsAt && row.endsAt ? await windowSales(row.storeId, row.startsAt, row.endsAt).catch(() => ({ orders: 0, revenue: 0 })) : { orders: 0, revenue: 0 };
  await notify({
    userId: row.store.userId,
    event: "store_campaign.ended",
    type: "marketing",
    priority: "success",
    title: `${row.name} has ended`,
    description: sales.orders
      ? `${sales.orders.toLocaleString("en-NG")} paid order${sales.orders === 1 ? "" : "s"} and ${naira(sales.revenue)} in sales while it ran. Your store is back to normal.`
      : "Your store is back to normal. See how it went in the campaign report.",
    link,
    actionLabel: "See results",
    metadata: { campaignId: row.id, orders: sales.orders, revenue: sales.revenue },
    dedupeKey: `store_campaign.ended:${row.id}:${row.endsAt?.toISOString()}`,
  }).catch(() => null);
}

async function runJobsForRow(row: JobRow, now: Date) {
  const done: CampaignJob[] = [];
  for (const job of dueCampaignJobs(row, now.getTime())) {
    try {
      await runJob(row, job, now);
      done.push(job);
    } catch (error) {
      console.error(`[campaigns] ${job} job failed for ${row.id}`, error);
    }
  }
  return done;
}

/** Runs whatever one campaign is owed right away (after an edit, End now, Resume…). Never throws. */
export async function runJobsForCampaign(id: string, now = new Date()) {
  const row = await db.storeCampaign.findUnique({ where: { id }, include: { store: { select: { userId: true, id: true } } } }).catch(() => null);
  if (!row) return [];
  return runJobsForRow(row, now);
}

/**
 * The cron sweep: every campaign with a start, ending-soon or end side effect still owed. Idempotent: each job is
 * claimed with a conditional update on its own column, so overlapping or repeated runs do nothing extra.
 */
export async function runCampaignJobs(now = new Date(), limit = 200) {
  const rows = await db.storeCampaign.findMany({
    where: {
      archivedAt: null,
      startsAt: { not: null, lte: now },
      endsAt: { not: null },
      OR: [
        { startJobRanAt: null, endsAt: { gt: now }, pausedAt: null },
        { endingSoonSentAt: null, endsAt: { gt: now }, pausedAt: null, endingSoonHours: { gt: 0 } },
        { endJobRanAt: null, endsAt: { lte: now } },
      ],
    },
    include: { store: { select: { userId: true, id: true } } },
    orderBy: { endsAt: "asc" },
    take: limit,
  });
  const results: Array<{ id: string; jobs: CampaignJob[] }> = [];
  for (const row of rows) {
    const jobs = await runJobsForRow(row, now);
    if (jobs.length) results.push({ id: row.id, jobs });
  }
  return { checked: rows.length, results };
}

// ─── Report ───────────────────────────────────────────────────────────────────

export async function campaignAnalytics(store: SellerStore, id: string, now = new Date()): Promise<CampaignAnalytics> {
  const row = await findOwn(store, id);
  const empty: CampaignAnalytics = { window: null, previous: null, sessions: 0, blockViews: 0, clicks: 0, popupShown: 0, popupClosed: 0, popupConverted: 0, emails: 0, orders: 0, revenue: 0, discountOrders: 0, discountRevenue: 0, previousOrders: 0, previousRevenue: 0 };
  if (!row.startsAt || !row.endsAt || row.startsAt.getTime() > now.getTime()) return empty;
  const from = row.startsAt;
  const to = new Date(Math.min(row.endsAt.getTime(), now.getTime()));
  const length = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - length);
  const formIds = row.blocks.filter((block) => block.type === "popup").map((block) => readPopupBlockSettings(block.settings).formId).filter((formId): formId is string => Boolean(formId));

  const [events, sales, previous, discount, emails] = await Promise.all([
    db.storeCampaignEvent.groupBy({ by: ["event"], where: { campaignId: row.id, createdAt: { gte: from, lt: to } }, _count: true }),
    windowSales(store.id, from, to),
    windowSales(store.id, prevFrom, from),
    row.discount
      ? db.retailOrder.aggregate({
          where: { storeId: store.id, createdAt: { gte: from, lt: to }, status: { in: [...PAID_ORDER_STATUSES] }, discountCode: { equals: row.discount.code, mode: "insensitive" } },
          _count: true,
          _sum: { total: true },
        })
      : null,
    formIds.length
      ? db.storeFormSubmission.count({ where: { storeId: store.id, createdAt: { gte: from, lt: to }, OR: formIds.map((formId) => ({ payload: { path: ["formId"], equals: formId } })) } })
      : 0,
  ]);
  const count = (name: string) => events.find((entry) => entry.event === name)?._count ?? 0;
  return {
    window: { from: from.toISOString(), to: to.toISOString() },
    previous: { from: prevFrom.toISOString(), to: from.toISOString() },
    sessions: count("page_view"),
    blockViews: count("block_view"),
    clicks: count("block_click"),
    popupShown: count("popup_shown"),
    popupClosed: count("popup_closed"),
    popupConverted: count("popup_converted"),
    emails,
    orders: sales.orders,
    revenue: sales.revenue,
    discountOrders: discount?._count ?? 0,
    discountRevenue: discount?._sum.total ?? 0,
    previousOrders: previous.orders,
    previousRevenue: previous.revenue,
  };
}

// ─── Product list timer badges ────────────────────────────────────────────────

export interface ProductCampaignTimer {
  campaignId: string;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  status: ReturnType<typeof computeCampaignStatus>;
  timezone: string;
}

/**
 * For the seller's product list: which live or upcoming campaign has a badge on each product (highest priority
 * first). Two small queries, only when the store has such campaigns.
 */
export async function productCampaignTimers(storeId: string, products: Array<{ id: string; retailPrice: number; compareAtPrice: number | null; tags?: string[] | null }>, now = new Date()) {
  const out: Record<string, ProductCampaignTimer> = {};
  const campaigns = await db.storeCampaign
    .findMany({
      where: { storeId, archivedAt: null, startsAt: { not: null }, endsAt: { gt: now }, blocks: { some: { type: "badge", enabled: true } } },
      select: { id: true, name: true, priority: true, startsAt: true, endsAt: true, pausedAt: true, archivedAt: true, endingSoonHours: true, timezone: true, blocks: { where: { type: "badge", enabled: true }, select: { settings: true } } },
      take: 20,
    })
    .catch(() => []);
  if (!campaigns.length) return out;
  campaigns.sort((a, b) => b.priority - a.priority || (toMs(b.startsAt) ?? 0) - (toMs(a.startsAt) ?? 0));
  const badges = campaigns.flatMap((campaign) => campaign.blocks.map((block) => ({ campaign, settings: readBadgeSettings(block.settings) })));
  const collectionIds = [...new Set(badges.filter((badge) => badge.settings.appliesTo === "collection" && badge.settings.collectionId).map((badge) => badge.settings.collectionId))];
  const links = collectionIds.length ? await db.collectionProduct.findMany({ where: { collectionId: { in: collectionIds } }, select: { collectionId: true, productId: true } }) : [];
  const members = new Map<string, Set<string>>();
  for (const link of links) members.set(link.collectionId, (members.get(link.collectionId) ?? new Set()).add(link.productId));
  for (const product of products) {
    const match = badges.find((badge) => badgeMatches(badge.settings, product, members.get(badge.settings.collectionId) ?? null));
    if (!match) continue;
    out[product.id] = {
      campaignId: match.campaign.id,
      name: match.campaign.name,
      startsAt: iso(match.campaign.startsAt),
      endsAt: iso(match.campaign.endsAt),
      status: computeCampaignStatus(match.campaign, now.getTime()),
      timezone: match.campaign.timezone,
    };
  }
  return out;
}

// ─── Countdowns in the backend ────────────────────────────────────────────────

/**
 * Every live or upcoming countdown the store has, for the dashboard widget: seasonal campaigns, plus countdown
 * pop-ups and countdown sections on the published store that aren't part of a campaign.
 */
export async function sellerCountdowns(store: { id: string; brandSettings: unknown }, now = new Date()): Promise<BackendCountdown[]> {
  const nowMs = now.getTime();
  const [campaigns, popups] = await Promise.all([
    db.storeCampaign
      .findMany({
        where: { storeId: store.id, archivedAt: null, startsAt: { not: null }, endsAt: { gt: now } },
        select: { id: true, name: true, startsAt: true, endsAt: true, pausedAt: true, archivedAt: true, endingSoonHours: true },
        orderBy: { startsAt: "asc" },
        take: 20,
      })
      .catch(() => []),
    db.storeForm.findMany({ where: { storeId: store.id, isPopup: true, active: true }, select: { id: true, name: true, popupConfig: true, createdAt: true }, take: 50 }).catch(() => []),
  ]);
  const items: BackendCountdown[] = campaigns.map((campaign) => ({
    key: `campaign:${campaign.id}`,
    source: "campaign",
    name: campaign.name,
    status: computeCampaignStatus(campaign, nowMs),
    startsAt: iso(campaign.startsAt),
    endsAt: iso(campaign.endsAt),
    href: `/home/campaigns/${campaign.id}`,
    campaignId: campaign.id,
  }));
  for (const form of popups) {
    const config = readPopupConfig(form.popupConfig);
    if (config.kind !== "countdown" || config.campaignId || !config.endsAt || Date.parse(config.endsAt) <= nowMs) continue;
    items.push({ key: `popup:${form.id}`, source: "popup", name: form.name, status: "live", startsAt: iso(form.createdAt), endsAt: config.endsAt, href: "/home/marketing/forms" });
  }
  const snapshot = publishedSnapshot(store.brandSettings);
  for (const page of snapshot?.pages ?? []) {
    for (const section of page.sections ?? []) {
      if (section.visible === false) continue;
      let endsAt: number | null = null;
      let startsAt: number | null = null;
      if (section.kind === "promo-banner" && section.settings?.layout === "countdown") endsAt = readCountdownEnd(section.settings)?.getTime() ?? null;
      else if (section.kind.startsWith("campaign-") && section.settings?.timer === "custom") endsAt = toMs(section.settings?.endsAt as string);
      else if (section.kind === "payday-countdown") {
        const window = paydayWindow(now, readPaydaySettings(section.settings));
        startsAt = window.start.getTime();
        endsAt = window.end.getTime();
      }
      if (endsAt === null || endsAt <= nowMs) continue;
      const scheduled = startsAt !== null && startsAt > nowMs;
      items.push({
        key: `section:${page.pageType}:${section.id}`,
        source: "section",
        name: section.name || section.kind,
        status: scheduled ? "scheduled" : "live",
        // Countdown sections without a start count as running since now.
        startsAt: new Date(startsAt ?? Math.min(nowMs, endsAt - 1000)).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        href: "/seller/store/builder",
      });
    }
  }
  return items;
}
