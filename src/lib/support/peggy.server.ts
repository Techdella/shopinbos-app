import "server-only";

import { after } from "next/server";
import { db } from "@/lib/db/client";
import { aiConfigured } from "@/lib/ai/client";
import { aiText, firstJsonObject } from "@/lib/ai/text";
import { getPlanCatalog } from "@/lib/plans/catalog.server";
import { getPriceBook } from "@/lib/pricing/price-book.server";
import { PLAN_TIERS, PLAN_TIER_KEYS } from "@shared/plan-catalog";
import { PEGGY_FACTS } from "./peggy-knowledge";
import { PEGGY_AUTO_CHANNELS, peggyChannel, peggyFormat, peggyMayAutoReply, type PeggyAutoChannel, type PeggySettings } from "./peggy-pure";

// Peggy in the admin inbox: she drafts replies for the team (Draft with Peggy), and, when an owner switches it on,
// answers new messages herself. She knows Shopinbos from a written fact sheet (peggy-knowledge.ts) plus the live
// numbers: prices and plans from the price book, and what the marketplace has today (suppliers, products,
// delivery partners and where they deliver). She never makes up a price, a feature or a promise; anything she
// isn't sure of, or anything that needs a person (refunds, account problems, complaints, deals), she hands to the
// team with a note.

const SETTINGS_KEY = "inbox.peggy";
const naira = (value: number) => `₦${Math.round(value).toLocaleString("en-NG")}`;

export async function peggySettings(): Promise<PeggySettings> {
  const row = await db.platformSetting.findUnique({ where: { key: SETTINGS_KEY } }).catch(() => null);
  const value = (row?.value ?? {}) as Partial<PeggySettings>;
  const channels = Array.isArray(value.autoReply) ? value.autoReply.filter((c): c is PeggyAutoChannel => (PEGGY_AUTO_CHANNELS as readonly string[]).includes(c)) : [];
  return { autoReply: channels };
}

export async function savePeggySettings(settings: PeggySettings, userId: string) {
  const value = { autoReply: settings.autoReply.filter((c) => (PEGGY_AUTO_CHANNELS as readonly string[]).includes(c)) };
  await db.platformSetting.upsert({ where: { key: SETTINGS_KEY }, create: { key: SETTINGS_KEY, value, updatedById: userId }, update: { value, updatedById: userId } });
}

/** Today's prices, plans and marketplace, as lines Peggy can quote. */
async function liveFacts() {
  const [book, catalog, suppliers, products, categories, partners] = await Promise.all([
    getPriceBook().catch(() => null),
    getPlanCatalog().catch(() => null),
    db.supplier.findMany({ where: { verificationStatus: "verified" }, select: { city: true }, take: 500 }).catch(() => []),
    db.supplierProduct.count({ where: { status: "published" } }).catch(() => 0),
    db.supplierProduct.groupBy({ by: ["categoryId"], where: { status: "published" }, _count: { _all: true }, orderBy: { _count: { categoryId: "desc" } }, take: 12 }).catch(() => []),
    db.logisticsPartner.findMany({ where: { verificationStatus: "verified" }, select: { city: true, coverageZones: true }, take: 500 }).catch(() => []),
  ]);
  const names = categories.length ? await db.category.findMany({ where: { id: { in: categories.map((c) => c.categoryId) } }, select: { id: true, name: true } }).catch(() => []) : [];
  const dropship = await db.supplierProduct.count({ where: { status: "published", dropshipAvailable: true } }).catch(() => 0);
  const lines: string[] = ["LIVE NUMBERS (from the app today; quote these exactly):"];
  if (book) {
    lines.push("- Publishing a store is free on every plan, the free Starter plan included. There is no launch fee.");
    lines.push(`- Fee on store sales paid by card or online bank transfer, by the seller's plan: Free ${book["store_fee.free"]}%, Starter ${book["store_fee.starter"]}%, Growth ${book["store_fee.growth"]}%, Pro ${book["store_fee.pro"]}% of the order (not on delivery, not on dropship items)${book["store_fee.min"] ? `, at least ${naira(book["store_fee.min"])}` : ""}${book["store_fee.max"] ? `, at most ${naira(book["store_fee.max"])}` : ""}. Paystack's own fee (1.5% + ₦100, ₦100 waived under ₦2,500, capped at ₦2,000) is paid by the seller.`);
    lines.push(`- Suppliers join and get verified free. Commission on marketplace orders: Free ${book["supplier_fee.free"]}%, Supplier Plus ${book["supplier_fee.plus"]}%, Supplier Pro ${book["supplier_fee.pro"]}% of the wholesale value.`);
    lines.push(book["delivery.enabled"] === "on"
      ? `- Delivery partners join and get verified free. Job fee on in-app delivery fees: Free ${book["delivery.free"]}%, Logistics Plus ${book["delivery.plus"]}%, Logistics Pro ${book["delivery.pro"]}%.`
      : `- Delivery partners join and get verified free. There is no job fee on deliveries at the moment (it will be ${book["delivery.free"]}% / ${book["delivery.plus"]}% / ${book["delivery.pro"]}% by plan when it starts).`);
    lines.push(`- Every new account gets a ${book["credits.welcome"]} AI credit signup bonus. Plans include monthly credits that refill each month. Credit packs (last 12 months): ${book["credits.small.credits"]} for ${naira(book["credits.small.naira"])}, ${book["credits.medium.credits"]} for ${naira(book["credits.medium.naira"])}, ${book["credits.large.credits"]} for ${naira(book["credits.large.naira"])}, ${book["credits.business.credits"]} for ${naira(book["credits.business.naira"])}. Failed AI jobs are refunded.`);
    lines.push(`- Boosts: featured supplier ${naira(book["boosts.supplier_week"])}/week, featured delivery partner ${naira(book["boosts.logistics_state_week"])}/week per state, boosted product ${naira(book["boosts.product_week"])}/week. Add-ons: ${naira(book["addons.sms_pack"])} per 500 SMS, ${naira(book["addons.whatsapp_pack"])} per 500 WhatsApp messages, ${naira(book["addons.staff_seat"])}/month per extra staff seat.`);
    lines.push(`- Ad campaigns run by the Shopinbos team: setup ${naira(book["ads.setup.meta"])} for Facebook & Instagram, ${naira(book["ads.setup.tiktok"])} for TikTok; ad spend is paid to Meta/TikTok, from ${naira(book["ads.min_daily_budget"])} a day.`);
    lines.push(`- Business name registration with CAC through Shopinbos: ${naira(book["business.bn_registration"])}.`);
    lines.push(`- Custom domains bought through Shopinbos: the registrar's price converted at about ${naira(book["domains.usd_rate"])}/USD plus ${naira(book["domains.markup"])}, rounded up to the next ₦500.`);
  }
  if (catalog) {
    for (const tier of PLAN_TIER_KEYS) {
      const offer = catalog.tiers[tier];
      const info = PLAN_TIERS[tier];
      const prices = [offer.monthly?.amountNgn ? `${naira(offer.monthly.amountNgn)}/month` : null, offer.annual?.amountNgn ? `${naira(offer.annual.amountNgn)}/year` : null].filter(Boolean).join(" or ");
      if (prices) lines.push(`- ${info.label} plan (${info.role}s): ${prices}, ${offer.creditsPerMonth} AI credits a month${info.freeDomainAnnual ? ", the annual plan pays for a custom domain" : ""}${info.hideBadge ? ", can hide \"Built with Shopinbos\"" : ""}.`);
    }
    lines.push("- Starter plan: free.");
  }
  const cities = (rows: Array<{ city: string | null }>) => [...new Set(rows.map((r) => r.city?.trim()).filter(Boolean))].slice(0, 12).join(", ");
  lines.push(`- Marketplace today: ${suppliers.length} verified supplier${suppliers.length === 1 ? "" : "s"}${suppliers.length ? ` (${cities(suppliers)})` : ""}, ${products} published supplier product${products === 1 ? "" : "s"}, ${dropship} of them open to dropshipping.`);
  if (names.length) lines.push(`- Biggest product categories: ${categories.map((c) => `${names.find((n) => n.id === c.categoryId)?.name ?? "Other"} (${c._count._all})`).join(", ")}.`);
  const zones = [...new Set(partners.flatMap((p) => [p.city, ...(p.coverageZones ?? [])]).map((z) => z?.trim()).filter(Boolean))].slice(0, 20);
  lines.push(`- Verified delivery partners: ${partners.length}${zones.length ? `, covering ${zones.join(", ")}` : ""}.`);
  lines.push("- If a number above is 0, the marketplace is still filling up before launch: say suppliers and delivery partners are joining now, never that there are none.");
  return lines.join("\n");
}

type Thread = {
  id: string;
  number: number;
  name: string;
  email: string | null;
  phone: string | null;
  source: string;
  portal: string;
  subject: string;
  lastUserMessageAt: Date | null;
  meta: unknown;
  messages: Array<{ authorType: string; authorName: string | null; body: string; internal: boolean; createdAt: Date }>;
};

async function loadThread(ticketId: string): Promise<Thread | null> {
  return db.supportTicket.findUnique({
    where: { id: ticketId },
    select: {
      id: true, number: true, name: true, email: true, phone: true, source: true, portal: true, subject: true, lastUserMessageAt: true, meta: true,
      messages: { orderBy: { createdAt: "asc" }, take: 60, select: { authorType: true, authorName: true, body: true, internal: true, createdAt: true } },
    },
  });
}

async function whoTheyAre(thread: Thread) {
  const meta = (thread.meta && typeof thread.meta === "object" ? thread.meta : {}) as Record<string, unknown>;
  const lines: string[] = [`Name: ${thread.name}`];
  if (thread.email) lines.push(`Email: ${thread.email}`);
  if (thread.phone) lines.push(`Phone/WhatsApp: ${thread.phone}`);
  const leadId = typeof meta.leadId === "string" ? meta.leadId : null;
  const lead = leadId ? await db.websiteLead.findUnique({ where: { id: leadId }, select: { kind: true, role: true, source: true, pageUrl: true, convertedAt: true } }).catch(() => null) : null;
  if (lead) lines.push(`Came from the website (${lead.kind} form${lead.pageUrl ? `, ${lead.pageUrl}` : ""}); signed up as a ${lead.role === "delivery" ? "delivery partner" : lead.role} lead${lead.convertedAt ? ", and already has an account" : ", no account yet"}.`);
  const userId = typeof meta.matchedUserId === "string" ? meta.matchedUserId : null;
  const user = userId ? await db.user.findUnique({ where: { id: userId }, select: { role: true, createdAt: true, store: { select: { name: true, status: true } } } }).catch(() => null) : null;
  if (user) lines.push(`Has a Shopinbos ${user.role.replace("_", " ")} account since ${user.createdAt.toISOString().slice(0, 10)}${user.store ? ` (store "${user.store.name}", ${user.store.status})` : ""}.`);
  else if (!lead) lines.push("No Shopinbos account found for them.");
  return lines.join("\n");
}

const SYSTEM = (facts: string, live: string, format: string) => `You are Peggy, the AI assistant on the Shopinbos team. You answer people who message Shopinbos (prospective sellers, suppliers and delivery partners, and existing users) on behalf of the team, warmly and like a smart, well-informed Nigerian colleague: clear, specific, never salesy fluff.

How to answer:
- Read the whole conversation. Answer EVERY question they asked, in the order they asked, with specifics from the facts below. If they mention their business (what they sell, where, an existing website or Instagram), make the answer about their situation.
- Use only the facts below and the live numbers. Never invent a price, fee, feature, partner, city, timeline or guarantee. If something isn't covered, say the team will confirm it, and set needs_human.
- Be honest about what's live now and what comes at launch (1 November 2026).
- End with one clear next step and the right link (seller sign-up, supplier sign-up, delivery partner sign-up, or WhatsApp us).
- Never ask for passwords, card numbers or one-time codes. Never promise refunds, discounts, custom deals or approvals.
- needs_human is true when: they are upset or complaining, it's about money already paid, a refund, payouts, an account they can't get into, verification decisions, a partnership/bulk deal, legal matters, or you're not sure of the answer.

${format}

${facts}

${live}

Reply with JSON only: {"reply": "<the message to send>", "needs_human": true|false, "note": "<one line for the team: what you assumed or couldn't answer, or empty>"}`;

export type PeggyDraft = { reply: string; needsHuman: boolean; note: string };

/** Peggy's reply to a conversation, for the team to send or edit. `instruction` steers it ("offer a call"). */
export async function peggyDraft(ticketId: string, options: { instruction?: string | null } = {}): Promise<PeggyDraft> {
  if (!aiConfigured()) throw new Error("Peggy needs an AI key on the server (ANTHROPIC_API_KEY or OPENAI_API_KEY).");
  const thread = await loadThread(ticketId);
  if (!thread) throw new Error("Conversation not found.");
  const channel = peggyChannel(thread.source, Boolean(thread.email));
  const [live, who] = await Promise.all([liveFacts(), whoTheyAre(thread)]);
  const transcript = thread.messages
    .filter((m) => m.body.trim() && m.authorType !== "system")
    .map((m) => `${m.internal ? "[TEAM NOTE, not seen by them] " : ""}${m.authorType === "user" ? thread.name : m.authorType === "ai" ? "Peggy (Shopinbos)" : `${m.authorName ?? "Team"} (Shopinbos)`}: ${m.body}`)
    .join("\n\n");
  const prompt = `WHO THEY ARE\n${who}\n\nCONVERSATION (oldest first; subject "${thread.subject}")\n${transcript || "(no messages)"}\n\n${options.instruction?.trim() ? `THE TEAM ASKS YOU TO: ${options.instruction.trim()}\n\n` : ""}Write the next reply from Shopinbos.`;
  const result = await aiText({ system: SYSTEM(PEGGY_FACTS, live, peggyFormat(channel, thread.name)), prompt, maxTokens: 6000 });
  const json = firstJsonObject(result?.text ?? null);
  const reply = typeof json?.reply === "string" ? json.reply.trim() : (result?.text ?? "").trim();
  if (!reply) throw new Error("Peggy couldn't write a reply just now. Try again.");
  return { reply, needsHuman: json?.needs_human === true, note: typeof json?.note === "string" ? json.note.trim() : "" };
}

/**
 * After a new customer message: when auto-reply is on for this channel and no person on the team is in the
 * conversation, Peggy answers. If she thinks a person should take it, she leaves her draft as a team note instead.
 * Runs after the response (webhooks answer Meta and Resend straight away).
 */
export function queuePeggyAutoReply(ticketId: string) {
  try {
    after(() => peggyAutoReply(ticketId).catch((error) => console.error("[peggy] auto-reply failed", error)));
  } catch {
    // Outside a request (a script): no auto-reply.
  }
}

async function peggyAutoReply(ticketId: string) {
  if (!aiConfigured()) return;
  const settings = await peggySettings();
  const ticket = await db.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, source: true, email: true, status: true, lastUserMessageAt: true, messages: { where: { internal: false }, orderBy: { createdAt: "desc" }, take: 20, select: { authorType: true, createdAt: true } } },
  });
  if (!ticket) return;
  const decision = peggyMayAutoReply({ settings, source: ticket.source, hasEmail: Boolean(ticket.email), status: ticket.status, messages: ticket.messages, now: Date.now() });
  if (!decision.ok) return;
  const draft = await peggyDraft(ticketId);
  const { agentReply, addInternalNote } = await import("./service.server");
  if (draft.needsHuman) {
    await addInternalNote(ticketId, `Peggy didn't send this because a person should look${draft.note ? ` (${draft.note})` : ""}. Her draft:\n\n${draft.reply}`);
    return;
  }
  await agentReply({ id: "peggy", role: "admin", name: "Peggy", email: null }, ticketId, { message: draft.reply, internal: false, files: [], asPeggy: true });
  if (draft.note) await addInternalNote(ticketId, `Peggy: ${draft.note}`);
}
