import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { aiText, firstJsonObject } from "@/lib/ai/text";
import { MARKETING_STORE_SELECT, storeUrl } from "@/lib/marketing/brand";
import { channelStatus, isMarketingOptOutError, textSender, type SendOutcome, type TextSender } from "@/lib/marketing/channels";
import { firstName } from "@/lib/marketing/flows";
import { loadOptOuts, recordOptOut } from "@/lib/marketing/opt-outs";
import { MarketingError } from "@/lib/marketing/segments";
import { isOptedOut } from "@/lib/marketing/text-channels";
import { draftFromPreset, resolvePresetTemplate, sendTemplate, submitWhatsAppTemplate } from "@/lib/marketing/whatsapp-templates.server";
import { isEmailConfigured, formatFromAddress, sendEmailBatch } from "@/lib/notifications/resend";
import { appBase, contactLinks, storeSender, unsubscribeHeaders } from "@/lib/email/compliance.server";
import { contactAllows } from "@/lib/email/preferences";
import { MISSING_ADDRESS_MESSAGE, html, storeEmail } from "@/lib/email/shell";
import { sendSafely } from "@/lib/email/batch-outcome";
import { normalizeEmail } from "@/lib/marketing/segment-rules";
import {
  BLAST_CHANNELS,
  BLAST_EVENT,
  BODY_MAX,
  FOLLOWER_TEMPLATE_PRESET,
  TITLE_MAX,
  blastAllowance,
  blastFinalStatus,
  blastRefId,
  blastWindowStart,
  checkBlast,
  countAudience,
  defaultBlastCopy,
  fillBlastText,
  followerChannels,
  whatsappNewsText,
  type AudienceCounts,
  type BlastAllowance,
  type BlastChannel,
  type ChannelReadiness,
  type FollowerBlastKind,
} from "@shared/follower-blasts";
import { PLUG_PUSH_READY, followerCount, followerTargets, shopperDetailsAtStore } from "./followers.server";

// "Notify my followers" (shared/follower-blasts.ts has the rules): a shop sends its followers news of a new drop, a
// pre-order or a live, at most 3 times in any 7 days. Sending works like text campaigns (src/lib/campaigns/send.ts):
//   1. createFollowerBlast checks the words and the weekly cap (under a per-store lock, so two taps can't both pass),
//      works out who gets it on which channel, saves the blast as "queued" and one CustomerMessage per follower and
//      channel (event "follower_blast", refId "<blast>:<shopper>"; the table's unique key means one message per
//      follower per channel per blast), then starts sending after the response.
//   2. processFollowerBlast claims the blast and sends what's queued: WhatsApp at the campaign rate (approved
//      "follower_news" template on the shop's own WhatsApp Business number), email in batches of 100 (Resend's batch
//      limit) through the store email shell with unsubscribe links. Each message's outcome is saved on its row, and
//      WhatsApp delivery receipts update it (marketingStatusHook). After 4 minutes it stops and leaves the rest queued.
//   3. The marketing cron (every 10 minutes) picks up blasts still queued or whose sending run stopped.
// Opt-outs are checked again right before each message: STOP / "Stop promotions" on WhatsApp (and Meta's "stopped
// marketing messages" error, which is recorded as an opt-out), and email unsubscribes / "Promotions" off.

const STALL_MS = 5 * 60_000;
const QUEUED_GRACE_MS = 60_000;
const TIME_BUDGET_MS = 240_000;
const EMAIL_BATCH = 100;
const PAGE = 200;

/** WhatsApp messages per second (same setting as text campaigns; Cloud API allows 80). */
function textRate() {
  const value = Number(process.env.MARKETING_TEXT_RATE_PER_SECOND);
  return Number.isFinite(value) && value >= 1 ? Math.min(Math.round(value), 80) : 10;
}

type BlastStore = { id: string; name: string; slug: string; customDomain: string | null; logoUrl: string | null; brandSettings: Prisma.JsonValue; status: string; currency: string };

const KIND_EYEBROW: Record<FollowerBlastKind, string> = { drop: "New drop", preorder: "Pre-order", live: "Live" };
const KIND_CTA: Record<FollowerBlastKind, string> = { drop: "See what's new", preorder: "Pre-order now", live: "Watch live" };

// ─── Readiness and the overview ───────────────────────────────────────────────

export type WhatsAppSetup = "ready" | "connect" | "template_missing" | "template_pending" | "template_rejected";

export interface ChannelState {
  whatsapp: { ready: boolean; setup: WhatsAppSetup; howTo: string };
  email: { ready: boolean; howTo: string };
  push: { ready: boolean };
}

/** What each channel needs before it can send. */
export async function blastChannelState(storeId: string): Promise<ChannelState> {
  const [channels, store] = await Promise.all([channelStatus(storeId), db.store.findUnique({ where: { id: storeId }, select: MARKETING_STORE_SELECT })]);
  let setup: WhatsAppSetup = "connect";
  if (channels.whatsapp.templates) {
    const template = await resolvePresetTemplate(storeId, FOLLOWER_TEMPLATE_PRESET).catch(() => null);
    if (template?.status === "APPROVED") setup = "ready";
    else {
      const latest = await db.whatsAppTemplate.findFirst({ where: { storeId, preset: FOLLOWER_TEMPLATE_PRESET }, orderBy: { updatedAt: "desc" }, select: { status: true } });
      setup = !latest || latest.status === "DRAFT" || latest.status === "LOCAL_ERROR" ? "template_missing" : latest.status === "REJECTED" || latest.status === "DISABLED" || latest.status === "PAUSED" ? "template_rejected" : "template_pending";
    }
  }
  const sender = store ? storeSender(store) : null;
  const emailReady = isEmailConfigured() && Boolean(sender?.hasAddress) && Boolean(contactLinks(storeId, "probe@example.com"));
  return {
    whatsapp: { ready: setup === "ready", setup, howTo: setup === "connect" ? channels.whatsapp.howTo : "" },
    email: { ready: emailReady, howTo: emailReady ? "" : !isEmailConfigured() ? channels.email.howTo : !sender?.hasAddress ? MISSING_ADDRESS_MESSAGE : "Email unsubscribe links aren't set up yet." },
    push: { ready: PLUG_PUSH_READY },
  };
}

/** Every non-empty choice of channels, each sorted (whatsapp, email, push → 7 choices). */
function channelChoices(): BlastChannel[][] {
  const out: BlastChannel[][] = [];
  for (let mask = 1; mask < 1 << BLAST_CHANNELS.length; mask++) out.push(BLAST_CHANNELS.filter((_, i) => mask & (1 << i)).sort());
  return out;
}

const readiness = (state: ChannelState): ChannelReadiness => ({ whatsapp: state.whatsapp.ready, email: state.email.ready, push: state.push.ready });

/** Counted blasts (for the cap) from the last week. */
async function recentBlasts(storeId: string, now = new Date(), client: Prisma.TransactionClient | typeof db = db) {
  return client.followerBlast.findMany({ where: { storeId, createdAt: { gt: blastWindowStart(now) } }, select: { status: true, createdAt: true } });
}

export interface BlastRow {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  productId: string | null;
  channels: string[];
  audienceCount: number;
  sentCount: number;
  failedCount: number;
  status: string;
  createdAt: Date;
  sentAt: Date | null;
}

export interface FollowersOverview {
  followers: number;
  audience: AudienceCounts;
  allowance: BlastAllowance;
  channels: ChannelState;
  blasts: BlastRow[];
  storeName: string;
  storeLink: string;
  limits: { title: number; body: number };
  /** Followers reached on at least one channel, for each choice of channels (key: channels sorted, joined by "+"). */
  reachBy: Record<string, number>;
  /** Published products for the optional product picker (newest first). */
  products: Array<{ id: string; name: string; imageUrl: string | null; url: string }>;
}

export async function followersOverview(store: { id: string; name: string; slug: string }): Promise<FollowersOverview> {
  const now = new Date();
  const [channels, targets, recent, blasts, count, full] = await Promise.all([
    blastChannelState(store.id),
    followerTargets(store.id),
    recentBlasts(store.id, now),
    db.followerBlast.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    followerCount(store.id),
    db.store.findUnique({ where: { id: store.id }, select: { slug: true, customDomain: true } }),
  ]);
  const products = await db.storeProduct
    .findMany({ where: { storeId: store.id, status: "published" }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, name: true, images: true } })
    .catch(() => []);
  return {
    followers: count,
    audience: countAudience(targets.map((t) => t.reach), BLAST_CHANNELS, readiness(channels)),
    reachBy: Object.fromEntries(channelChoices().map((choice) => [choice.join("+"), countAudience(targets.map((t) => t.reach), choice, readiness(channels)).reachable])),
    allowance: blastAllowance(recent, now),
    channels,
    blasts: blasts.map(({ id, kind, title, body, link, productId, channels: used, audienceCount, sentCount, failedCount, status, createdAt, sentAt }) => ({ id, kind, title, body, link, productId, channels: used, audienceCount, sentCount, failedCount, status, createdAt, sentAt })),
    storeName: store.name,
    storeLink: full ? storeUrl(full) : "",
    limits: { title: TITLE_MAX, body: BODY_MAX },
    products: products.map((p) => ({ id: p.id, name: p.name, imageUrl: p.images.find((src) => /^https:\/\//.test(src)) ?? null, url: full ? storeUrl(full, `/product/${p.id}`) : "" })),
  };
}

// ─── Creating a blast ─────────────────────────────────────────────────────────

const PROBLEM_TEXT: Record<string, string> = {
  kind: "Pick what it's about: a new drop, a pre-order or a live.",
  title_missing: "Give it a title.",
  title_long: `Keep the title to ${TITLE_MAX} characters.`,
  body_missing: "Write the message.",
  body_long: `Keep the message to ${BODY_MAX} characters.`,
  link_bad: "The link must start with https://",
};

export class BlastCapError extends MarketingError {
  constructor(public allowance: BlastAllowance) {
    super(`You've sent ${allowance.cap} messages to your followers this week. You can send another ${allowance.nextFreeAt ? `from ${allowance.nextFreeAt.toUTCString()}` : "soon"}.`);
  }
}

export async function createFollowerBlast(store: { id: string; name: string }, userId: string, raw: { kind?: unknown; title?: unknown; body?: unknown; productId?: unknown; link?: unknown; channels?: unknown }) {
  const { input, problems } = checkBlast(raw);
  if (problems.length) throw new MarketingError(PROBLEM_TEXT[problems[0]] ?? "Check the message and try again.");
  const chosen = (Array.isArray(raw.channels) ? raw.channels : BLAST_CHANNELS).filter((c): c is BlastChannel => (BLAST_CHANNELS as readonly string[]).includes(String(c)));
  if (!chosen.length) throw new MarketingError("Pick at least one way to send it.");

  const full = await db.store.findUnique({ where: { id: store.id }, select: MARKETING_STORE_SELECT });
  if (!full) throw new MarketingError("Store not found");
  let link = input.link;
  if (input.productId) {
    const product = await db.storeProduct.findFirst({ where: { id: input.productId, storeId: store.id }, select: { id: true } });
    if (!product) throw new MarketingError("That product isn't in your shop any more. Pick another one.");
    link ??= storeUrl(full, `/product/${product.id}`);
  }
  link ??= storeUrl(full);

  const state = await blastChannelState(store.id);
  const ready = readiness(state);
  const targets = await followerTargets(store.id);
  const plan = targets.map((target) => ({ target, channels: followerChannels(target.reach, chosen, ready) })).filter((p) => p.channels.length);
  if (!plan.length) {
    throw new MarketingError(targets.length ? "None of your followers can get this yet on the ways you picked. WhatsApp needs their opt-in and an approved template; email needs their email and your business address." : "You don't have followers yet. Everyone who buys from you follows your shop.");
  }
  const usedChannels = BLAST_CHANNELS.filter((channel) => plan.some((p) => p.channels.includes(channel)));

  // The cap and the new blast in one transaction, under a per-store lock: two taps at once can't both get the last slot.
  const blast = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`follower_blast:${store.id}`}))`;
    const allowance = blastAllowance(await recentBlasts(store.id, new Date(), tx));
    if (allowance.left <= 0) throw new BlastCapError(allowance);
    return tx.followerBlast.create({
      data: { storeId: store.id, kind: input.kind, title: input.title, body: input.body, productId: input.productId, link, channels: usedChannels, audienceCount: plan.length, status: "queued", createdBy: userId },
    });
  });

  // One message row per follower and channel (push has no rows: nobody has Plug yet).
  const rows: Prisma.CustomerMessageCreateManyInput[] = [];
  for (const { target, channels } of plan) {
    for (const channel of channels) {
      if (channel === "push") continue;
      rows.push({ storeId: store.id, event: BLAST_EVENT, refId: blastRefId(blast.id, target.shopperId), channel, to: channel === "email" ? target.email! : target.phone, status: "queued" });
    }
  }
  for (let i = 0; i < rows.length; i += 1000) await db.customerMessage.createMany({ data: rows.slice(i, i + 1000), skipDuplicates: true });
  return blast;
}

// ─── Sending ──────────────────────────────────────────────────────────────────

const shopperOf = (refId: string) => refId.slice(refId.indexOf(":") + 1);

async function finish(id: string, outcome: SendOutcome | { ok: false; error: string; skipped: true }, templateId?: string | null) {
  await db.customerMessage
    .update({
      where: { id },
      data: outcome.ok
        ? { status: "sent", sentAt: new Date(), externalId: outcome.externalId, error: null, templateId: templateId ?? null }
        : { status: "skipped" in outcome ? "skipped" : "failed", error: outcome.error.slice(0, 300), templateId: templateId ?? null },
    })
    .catch(() => null);
}

/** Saves the blast's counts and status from its message rows. */
async function settle(blastId: string, storeId: string, error?: string | null) {
  const where = { storeId, event: BLAST_EVENT, refId: { startsWith: `${blastId}:` } };
  const groups = await db.customerMessage.groupBy({ by: ["status"], where, _count: { _all: true } });
  const count = (statuses: string[]) => groups.filter((g) => statuses.includes(g.status)).reduce((sum, g) => sum + g._count._all, 0);
  const counts = { sent: count(["sent", "delivered", "read"]), failed: count(["failed", "skipped"]), queued: count(["queued"]) };
  const status = blastFinalStatus(counts);
  await db.followerBlast.update({
    where: { id: blastId },
    data: { sentCount: counts.sent, failedCount: counts.failed, status, ...(status === "sent" ? { sentAt: new Date() } : {}), ...(status === "failed" ? { error: (error ?? "Nothing could be sent").slice(0, 300) } : {}) },
  });
  return { ...counts, status };
}

/**
 * Sends what's queued for one blast. Claims it first (queued, or a sending run that stopped), so only one run sends
 * it. Never throws.
 */
export async function processFollowerBlast(blastId: string) {
  try {
    const claimed = await db.followerBlast.updateMany({
      where: { id: blastId, OR: [{ status: "queued" }, { status: "sending", updatedAt: { lt: new Date(Date.now() - STALL_MS) } }] },
      data: { status: "sending" },
    });
    if (!claimed.count) return null;
    const blast = await db.followerBlast.findUnique({ where: { id: blastId } });
    const store = blast ? ((await db.store.findUnique({ where: { id: blast.storeId }, select: MARKETING_STORE_SELECT })) as BlastStore | null) : null;
    if (!blast || !store) return null;
    return await sendQueued(blast, store);
  } catch (error) {
    console.error(`[followers] blast ${blastId} failed`, error);
    return null;
  }
}

type Blast = NonNullable<Awaited<ReturnType<typeof db.followerBlast.findUnique>>>;

async function sendQueued(blast: Blast, store: BlastStore) {
  const kind = (["drop", "preorder", "live"].includes(blast.kind) ? blast.kind : "drop") as FollowerBlastKind;
  const product = blast.productId ? await db.storeProduct.findFirst({ where: { id: blast.productId, storeId: store.id }, select: { name: true } }) : null;
  const where = { storeId: store.id, event: BLAST_EVENT, refId: { startsWith: `${blast.id}:` }, status: "queued" };
  const optOuts = await loadOptOuts(store.id);

  // WhatsApp: the approved follower template on the shop's own number.
  const template = await resolvePresetTemplate(store.id, FOLLOWER_TEMPLATE_PRESET).catch(() => null);
  let sender: TextSender | null = null;
  const whatsappSender = async () => (sender ??= await textSender(store));

  // Email: the store shell (marketing kind) with the follower's own unsubscribe links.
  const storeAsSender = storeSender(store);
  const emailReady = isEmailConfigured() && storeAsSender.hasAddress;
  const from = formatFromAddress(store.name);

  const started = Date.now();
  let lastTouch = started;
  const rate = textRate();
  let whatsappFailures = 0;
  let whatsappStopped: string | null = null;
  let emailStopped: string | null = null;
  let lastError: string | null = null;

  for (;;) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const page = await db.customerMessage.findMany({ where, orderBy: { createdAt: "asc" }, take: PAGE, select: { id: true, refId: true, channel: true, to: true } });
    if (!page.length) break;
    const names = await shopperDetailsAtStore(store.id, page.map((row) => shopperOf(row.refId)));
    const valuesFor = (refId: string) => ({ first_name: firstName(names.get(shopperOf(refId))?.name) || "there", store_name: store.name, product_name: product?.name ?? "" });

    // ── WhatsApp, `rate` a second ──
    const whatsapp = page.filter((row) => row.channel === "whatsapp");
    for (let i = 0; i < whatsapp.length; i += rate) {
      const slice = whatsapp.slice(i, i + rate);
      const sliceStarted = Date.now();
      const results = await Promise.all(
        slice.map(async (row) => {
          if (whatsappStopped || !template || template.status !== "APPROVED") {
            const error = whatsappStopped ?? "The WhatsApp template for follower news isn't approved yet.";
            await finish(row.id, { ok: false, error, skipped: true }, template?.id);
            return null;
          }
          // Someone may have sent STOP since the blast was queued.
          if (isOptedOut(optOuts, "whatsapp", row.to, "marketing")) {
            await finish(row.id, { ok: false, error: "They opted out of WhatsApp", skipped: true });
            return null;
          }
          const values = valuesFor(row.refId);
          const outcome = await sendTemplate(await whatsappSender(), template, row.to, {
            values: { first_name: values.first_name, store_name: store.name, follower_news: whatsappNewsText(blast, values), link: blast.link, product_name: values.product_name, product_link: blast.link },
          }).catch((error): SendOutcome => ({ ok: false, error: String(error) }));
          await finish(row.id, outcome, template.id);
          if (!outcome.ok) {
            lastError = outcome.error;
            if (isMarketingOptOutError(outcome.error)) await recordOptOut(store.id, row.to, "whatsapp", { scope: "marketing", source: "whatsapp_meta" }).catch(() => null);
          }
          return outcome.ok;
        }),
      );
      const tried = results.filter((r) => r !== null);
      whatsappFailures = tried.length && tried.every((ok) => !ok) ? whatsappFailures + tried.length : tried.some(Boolean) ? 0 : whatsappFailures;
      // The provider is refusing everything (credit, number, template): skip the rest rather than burn through them.
      if (whatsappFailures >= 15 && !whatsappStopped) whatsappStopped = `Stopped after repeated WhatsApp failures: ${lastError ?? "the provider refused"}`.slice(0, 300);
      const wait = 1000 - (Date.now() - sliceStarted);
      if (wait > 0 && i + rate < whatsapp.length) await new Promise((resolve) => setTimeout(resolve, wait));
    }

    // ── Email, one batch of up to 100 at a time ──
    const emails = page.filter((row) => row.channel === "email");
    for (let i = 0; i < emails.length; i += EMAIL_BATCH) {
      const batch = emails.slice(i, i + EMAIL_BATCH);
      if (emailStopped || !emailReady) {
        const error = emailStopped ?? (isEmailConfigured() ? MISSING_ADDRESS_MESSAGE : "Email sending isn't set up yet.");
        await Promise.all(batch.map((row) => finish(row.id, { ok: false, error, skipped: true })));
        continue;
      }
      // Unsubscribed (or turned "Promotions" off) since the blast was queued.
      const addresses = batch.map((row) => normalizeEmail(row.to) ?? row.to);
      const listed = await db.subscriber.findMany({ where: { storeId: store.id, email: { in: addresses } }, select: { email: true, status: true, metadata: true } });
      const byEmail = new Map(listed.map((row) => [row.email.trim().toLowerCase(), row]));
      const sendable: Array<{ row: (typeof batch)[number]; email: { to: string; subject: string; html: string; from: string; headers: Record<string, string> } }> = [];
      for (const row of batch) {
        const address = normalizeEmail(row.to) ?? row.to;
        if (!contactAllows(byEmail.get(address) ?? null, "promotions")) {
          await finish(row.id, { ok: false, error: "They unsubscribed from this shop's emails", skipped: true });
          continue;
        }
        const links = contactLinks(store.id, address);
        if (!links) {
          await finish(row.id, { ok: false, error: "Email unsubscribe links aren't set up yet.", skipped: true });
          continue;
        }
        const values = valuesFor(row.refId);
        const title = fillBlastText(blast.title, values);
        const body = fillBlastText(blast.body, values);
        sendable.push({
          row,
          email: {
            to: address,
            subject: title,
            from,
            html: storeEmail({
              appUrl: appBase(),
              store: storeAsSender,
              kind: "marketing",
              title,
              preheader: body.slice(0, 120),
              eyebrow: KIND_EYEBROW[kind],
              heading: title,
              bodyHtml: html.text(body),
              cta: { label: KIND_CTA[kind], url: blast.link },
              reason: `you follow ${store.name} or bought from them`,
              unsubscribeUrl: links.unsubscribe,
              preferencesUrl: links.preferences,
            }),
            headers: unsubscribeHeaders(links),
          },
        });
      }
      if (!sendable.length) continue;
      const outcome = await sendSafely((list: typeof sendable) => sendEmailBatch(list.map((item) => item.email), { permissive: true }), sendable);
      if (outcome.kind === "sent" || outcome.kind === "partial") {
        const refused = new Map(outcome.kind === "partial" ? outcome.refused.map((r) => [r.index, r.message]) : []);
        await Promise.all(sendable.map((item, index) => finish(item.row.id, refused.has(index) ? { ok: false, error: refused.get(index)! } : { ok: true, externalId: null })));
      } else {
        // Refused as a whole (quota, domain) or no answer: never retried (a duplicate is worse than a missing email),
        // and the rest of this blast's emails are skipped.
        lastError = outcome.message;
        emailStopped = `Email stopped: ${outcome.message}`.slice(0, 300);
        await Promise.all(sendable.map((item) => finish(item.row.id, { ok: false, error: outcome.kind === "unknown" ? `No answer from the email provider (not retried): ${outcome.message}` : outcome.message })));
      }
    }

    if (Date.now() - lastTouch > 20_000) {
      // Keeps the claim fresh so the cron doesn't think this run died.
      await db.followerBlast.update({ where: { id: blast.id }, data: { status: "sending" } });
      lastTouch = Date.now();
    }
  }
  return settle(blast.id, store.id, lastError);
}

/** For the marketing cron: blasts still queued (their first run never started) or whose sending run stopped. */
export async function resumeFollowerBlasts(now = new Date()) {
  const due = await db.followerBlast.findMany({
    where: {
      OR: [
        { status: "queued", createdAt: { lt: new Date(now.getTime() - QUEUED_GRACE_MS) } },
        { status: "sending", updatedAt: { lt: new Date(now.getTime() - STALL_MS) } },
      ],
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 5,
  });
  const results = [];
  for (const blast of due) results.push({ id: blast.id, result: await processFollowerBlast(blast.id) });
  return results;
}

// ─── WhatsApp template and Rex's draft ────────────────────────────────────────

/** Creates the "follower_news" template from the ready-made one and sends it to Meta for approval. */
export async function setUpFollowerTemplate(storeId: string) {
  const existing = await db.whatsAppTemplate.findFirst({ where: { storeId, preset: FOLLOWER_TEMPLATE_PRESET, status: { in: ["DRAFT", "LOCAL_ERROR", "PENDING", "APPROVED", "IN_APPEAL"] } }, orderBy: { updatedAt: "desc" } });
  if (existing && existing.status !== "DRAFT" && existing.status !== "LOCAL_ERROR") return { status: existing.status };
  const draft = existing ?? (await draftFromPreset(storeId, FOLLOWER_TEMPLATE_PRESET));
  const submitted = await submitWhatsAppTemplate(storeId, draft.id);
  return { status: submitted.status };
}

/** Rex writes the title and message from the kind and product (the shop's own facts only). Falls back to a ready one. */
export async function draftBlastWithRex(store: { id: string; name: string }, input: { kind: FollowerBlastKind; productId?: string | null; notes?: string | null; language?: string | null }) {
  const product = input.productId ? await db.storeProduct.findFirst({ where: { id: input.productId, storeId: store.id }, select: { name: true, description: true } }) : null;
  const fallback = defaultBlastCopy(input.kind, { storeName: store.name, productName: product?.name });
  const about = { drop: "a new drop (new products just arrived)", preorder: "pre-orders now open", live: "a live video session" }[input.kind];
  const result = await aiText({
    fast: true,
    maxTokens: 400,
    system:
      `You write short news messages from ${store.name}, a small shop in Nigeria, to the people who follow it. They go by WhatsApp and email. ` +
      `Warm, clear, everyday ${input.language && input.language !== "en" ? `language (write in the language with code "${input.language}", keeping product names and "Shopinbos" as they are)` : "Nigerian English"}. ` +
      `Title at most ${TITLE_MAX} characters; message at most ${Math.min(BODY_MAX, 240)} characters, one or two sentences, no hashtags, at most one emoji. ` +
      "Start the message with Hi {{first_name}}. Never invent prices, discounts, dates or stock levels the seller didn't give. " +
      'Answer with JSON only: {"title":"…","body":"…"}',
    prompt: [`It's about ${about}.`, product ? `Product: ${product.name}${product.description ? ` (${product.description.slice(0, 300)})` : ""}.` : "", input.notes?.trim() ? `The seller says: ${input.notes.trim().slice(0, 400)}` : ""].filter(Boolean).join("\n"),
  }).catch(() => null);
  const json = firstJsonObject(result?.text ?? null);
  if (json && typeof json.title === "string" && typeof json.body === "string" && json.title.trim() && json.body.trim()) {
    return { ai: true, title: json.title.trim().slice(0, TITLE_MAX), body: json.body.trim().slice(0, BODY_MAX) };
  }
  return { ai: false, ...fallback };
}
