import "server-only";

import { db } from "@/lib/db/client";
import { logDataAccess } from "@/lib/admin/data-access.server";
import {
  ADJUSTMENT_MAX,
  AIRTIME_MAX,
  PAYOUT_SOURCE_LABELS,
  cleanAirtimePhone,
  cleanLedgerText,
  cleanNairaAmount,
  currentPayday,
  dateToDay,
  dayToDate,
  earnerSummary,
  isPayoutSourceKind,
  linesToCarry,
  markPaidProblem,
  planResellSync,
  rewardProblem,
  type LedgerLine,
  type PayoutMethod,
} from "@shared/payout-ledger";

// The payout and rewards ledger on the server (rules: shared/payout-ledger.ts; tables:
// docs/migrations/2026-12-16-payout-ledger.sql). Shopinbos never holds or moves this money: it records what each
// earner is owed and by which shop, and admins mark lines paid once the money moved.
//
//   * syncLedger: approved resell sales → owed lines (idempotent), voided sales → void lines, unpaid lines → the
//     current Friday's list. Creator briefs and personal shopper jobs get their own sync step here when they exist.
//   * ledgerWeek: one Friday's list with each earner's name, phone and bank details (admins only).
//   * markLinesPaid / voidLines / addReward / closeWeek: admin changes, each written to the admin data access log.
//   * earnerLedger: an earner's own "owed to you" / "paid" totals.

export class PayoutsNotReady extends Error {}

function missingTable(error: unknown) {
  const code = error && typeof error === "object" ? (error as { code?: string }).code : undefined;
  return code === "P2021" || code === "P2022" || /does not exist/i.test(String((error as Error)?.message ?? ""));
}

async function ready<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (missingTable(error)) throw new PayoutsNotReady("Payouts need a quick database update: run docs/migrations/2026-12-16-payout-ledger.sql.");
    throw error;
  }
}

export type LedgerResult = { ok: true; count: number } | { ok: false; error: string };

// ─── Weeks ────────────────────────────────────────────────────────────────────

/** The Friday whose list is open now (this Friday's, or next Friday's once this one is closed). */
async function openPayday(now = new Date()) {
  const closed = await db.payoutBatch.findMany({ where: { status: "paid", weekStart: { gte: dayToDate(dateToDay(new Date(now.getTime() - 8 * 24 * 3600_000))) } }, select: { weekStart: true } });
  return currentPayday(now, closed.map((batch) => dateToDay(batch.weekStart)));
}

async function batchFor(payday: string) {
  const weekStart = dayToDate(payday);
  return db.payoutBatch.upsert({ where: { weekStart }, create: { weekStart }, update: {} });
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

/** Brings the ledger up to date. Safe to run any time and more than once. Returns the open Friday. */
export async function syncLedger(now = new Date()): Promise<string> {
  return ready(async () => {
    const payday = await openPayday(now);
    const batch = await batchFor(payday);

    // Resell: approved sales without a line, and owed lines whose sale was voided since.
    const owedResell = await db.payoutLine.findMany({ where: { sourceKind: "resell", status: "owed" }, select: { id: true, sourceKind: true, sourceId: true, status: true } });
    const candidates = await db.resellSale.findMany({
      where: { OR: [{ status: "approved" }, { id: { in: owedResell.map((line) => line.sourceId).filter((id): id is string => Boolean(id)) } }] },
      select: { id: true, storeId: true, resellerUserId: true, commissionAmount: true, status: true },
      take: 5000,
    });
    const known = await db.payoutLine.findMany({ where: { sourceKind: "resell", sourceId: { in: candidates.map((sale) => sale.id) } }, select: { id: true, sourceKind: true, sourceId: true, status: true } });
    const plan = planResellSync(candidates, known);
    if (plan.create.length) {
      await db.payoutLine.createMany({ data: plan.create.map((line) => ({ ...line, batchId: batch.id })), skipDuplicates: true });
    }
    if (plan.voidLineIds.length) {
      await db.payoutLine.updateMany({ where: { id: { in: plan.voidLineIds }, status: "owed" }, data: { status: "void", note: "The order was cancelled, refunded or returned." } });
    }

    // Unpaid lines from earlier (or closed) lists carry over to the open one.
    const owed = await db.payoutLine.findMany({ where: { status: "owed", OR: [{ batchId: null }, { NOT: { batchId: batch.id } }] }, select: { id: true, status: true, batch: { select: { weekStart: true } } } });
    const carry = linesToCarry(owed.map((line) => ({ id: line.id, status: line.status, batchPayday: line.batch ? dateToDay(line.batch.weekStart) : null })), payday);
    if (carry.length) await db.payoutLine.updateMany({ where: { id: { in: carry }, status: "owed" }, data: { batchId: batch.id } });
    return payday;
  });
}

// ─── One week's list ──────────────────────────────────────────────────────────

export interface LedgerFilters {
  status?: "owed" | "paid" | "void" | "";
  kind?: string;
  q?: string;
}

export interface EarnerInfo {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  /** Where to send money by hand. Admins only: never shown to shops or other earners. */
  bank: { bankName: string | null; accountNumber: string | null; accountName: string | null; source: "wallet" | "supplier" | "logistics" } | null;
}

export type LedgerLineRow = LedgerLine & { batchId: string | null; paidByName: string | null };

const ISO = (date: Date | null) => (date ? date.toISOString() : null);

async function earnersById(ids: string[]): Promise<Map<string, EarnerInfo>> {
  if (!ids.length) return new Map();
  const [users, wallets, suppliers, partners] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true, phone: true, role: true } }),
    db.wallet.findMany({ where: { userId: { in: ids } }, select: { userId: true, bankName: true, accountNumber: true, accountName: true } }),
    db.supplier.findMany({ where: { userId: { in: ids } }, select: { userId: true, payoutAccount: { select: { bankName: true, accountNumberMask: true, accountName: true } } } }).catch(() => []),
    db.logisticsPartner.findMany({ where: { userId: { in: ids } }, select: { userId: true, payoutAccount: { select: { bankName: true, accountNumberMask: true, accountName: true } } } }).catch(() => []),
  ]);
  const walletOf = new Map(wallets.map((wallet) => [wallet.userId, wallet]));
  const supplierOf = new Map(suppliers.map((row) => [row.userId, row.payoutAccount]));
  const partnerOf = new Map(partners.map((row) => [row.userId, row.payoutAccount]));
  const out = new Map<string, EarnerInfo>();
  for (const user of users) {
    const wallet = walletOf.get(user.id);
    const supplier = supplierOf.get(user.id);
    const partner = partnerOf.get(user.id);
    const bank = wallet?.accountNumber
      ? { bankName: wallet.bankName, accountNumber: wallet.accountNumber, accountName: wallet.accountName, source: "wallet" as const }
      : supplier
        ? { bankName: supplier.bankName, accountNumber: supplier.accountNumberMask, accountName: supplier.accountName, source: "supplier" as const }
        : partner
          ? { bankName: partner.bankName, accountNumber: partner.accountNumberMask, accountName: partner.accountName, source: "logistics" as const }
          : null;
    out.set(user.id, { id: user.id, name: user.name, email: user.email, phone: user.phone, role: String(user.role), bank });
  }
  return out;
}

/** One Friday's list (the open one after a sync when `payday` is omitted), with earners, shops and totals. */
export async function ledgerWeek(payday: string | null, filters: LedgerFilters = {}) {
  return ready(async () => {
    const open = await syncLedger();
    const day = payday ?? open;
    const batch = await db.payoutBatch.findUnique({ where: { weekStart: dayToDate(day) } });
    const raw = batch
      ? await db.payoutLine.findMany({
          where: {
            batchId: batch.id,
            ...(filters.status ? { status: filters.status } : {}),
            ...(filters.kind && isPayoutSourceKind(filters.kind) ? { sourceKind: filters.kind } : {}),
          },
          orderBy: { createdAt: "asc" },
          take: 5000,
        })
      : [];
    const earners = await earnersById([...new Set(raw.map((line) => line.earnerUserId))]);
    const q = (filters.q ?? "").trim().toLowerCase();
    const stores = await db.store.findMany({ where: { id: { in: [...new Set(raw.flatMap((line) => (line.storeId ? [line.storeId] : [])))] } }, select: { id: true, name: true, handle: true } });
    const storeName = new Map(stores.map((store) => [store.id, store.name]));
    const admins = await db.user.findMany({ where: { id: { in: [...new Set(raw.flatMap((line) => (line.paidBy ? [line.paidBy] : [])))] } }, select: { id: true, name: true } });
    const adminName = new Map(admins.map((admin) => [admin.id, admin.name]));
    const lines: LedgerLineRow[] = raw
      .filter((line) => {
        if (!q) return true;
        const person = earners.get(line.earnerUserId);
        return [person?.name, person?.email, person?.phone, line.storeId ? storeName.get(line.storeId) : null, line.reference].some((text) => text && text.toLowerCase().includes(q));
      })
      .map((line) => ({
        id: line.id,
        batchId: line.batchId,
        earnerUserId: line.earnerUserId,
        sourceKind: line.sourceKind,
        sourceId: line.sourceId,
        storeId: line.storeId,
        amount: line.amount,
        status: line.status,
        method: line.method,
        reference: line.reference,
        note: line.note,
        phone: line.phone,
        network: line.network,
        paidAt: ISO(line.paidAt),
        createdAt: line.createdAt.toISOString(),
        paidByName: line.paidBy ? adminName.get(line.paidBy) ?? "A removed team member" : null,
      }));
    return { payday: day, openPayday: open, batch: batch ? { id: batch.id, status: batch.status, closedAt: ISO(batch.closedAt), closedBy: batch.closedBy } : null, lines, earners, storeName };
  });
}

/** Earlier lists, newest first, with their totals. */
export async function pastWeeks(take = 26) {
  return ready(async () => {
    const batches = await db.payoutBatch.findMany({ orderBy: { weekStart: "desc" }, take });
    const sums = batches.length
      ? await db.payoutLine.groupBy({ by: ["batchId", "status"], where: { batchId: { in: batches.map((batch) => batch.id) } }, _sum: { amount: true }, _count: { _all: true } })
      : [];
    return batches.map((batch) => {
      const rows = sums.filter((row) => row.batchId === batch.id);
      const sum = (status: string) => rows.filter((row) => row.status === status).reduce((total, row) => total + (row._sum.amount ?? 0), 0);
      return { payday: dateToDay(batch.weekStart), status: batch.status, closedAt: ISO(batch.closedAt), owed: sum("owed"), paid: sum("paid"), lines: rows.reduce((total, row) => total + row._count._all, 0) };
    });
  });
}

/** Who owes each line, for labels: the shop's name, or "Shopinbos" for its own rewards. */
export function owedByLabel(line: Pick<LedgerLine, "storeId" | "sourceKind">, storeName: Map<string, string>) {
  if (line.storeId) return storeName.get(line.storeId) ?? "A closed shop";
  return line.sourceKind === "airtime_reward" || line.sourceKind === "adjustment" ? "Shopinbos" : PAYOUT_SOURCE_LABELS[line.sourceKind as keyof typeof PAYOUT_SOURCE_LABELS] ?? line.sourceKind;
}

// ─── Admin changes ────────────────────────────────────────────────────────────

/**
 * Marks owed lines paid (how, reference, note, who, when). Resell lines also set their ResellSale to "paid", so the
 * shop and the reseller see it as paid. Lines already paid or void are left alone.
 */
export async function markLinesPaid(input: { adminId: string; lineIds: string[]; method: string; reference?: string | null; note?: string | null }): Promise<LedgerResult> {
  const problem = markPaidProblem({ method: input.method, reference: input.reference });
  if (problem) return { ok: false, error: problem };
  const ids = [...new Set(input.lineIds.map((id) => String(id).slice(0, 40)).filter(Boolean))].slice(0, 500);
  if (!ids.length) return { ok: false, error: "Nothing to mark paid." };
  return ready(async () => {
    const lines = await db.payoutLine.findMany({ where: { id: { in: ids }, status: "owed" } });
    if (!lines.length) return { ok: false as const, error: "Those lines are already paid or cancelled." };
    const now = new Date();
    const reference = cleanLedgerText(input.reference, 120);
    const note = cleanLedgerText(input.note, 300);
    const resellSaleIds = lines.filter((line) => line.sourceKind === "resell" && line.sourceId).map((line) => line.sourceId as string);
    const changed = await db.$transaction(async (tx) => {
      const updated = await tx.payoutLine.updateMany({
        where: { id: { in: lines.map((line) => line.id) }, status: "owed" },
        data: { status: "paid", method: input.method as PayoutMethod, reference, ...(note ? { note } : {}), paidAt: now, paidBy: input.adminId },
      });
      if (resellSaleIds.length) await tx.resellSale.updateMany({ where: { id: { in: resellSaleIds }, status: { in: ["pending", "approved"] } }, data: { status: "paid" } });
      return updated.count;
    });
    await logForEarners(input.adminId, lines, "payout_paid", (total) => `₦${total.toLocaleString("en-NG")} marked paid · ${input.method}${reference ? ` · ${reference}` : ""}`);
    return { ok: true as const, count: changed };
  });
}

/** Cancels owed lines (a mistake, a reward withdrawn). Resell sales are left as they are. */
export async function voidLines(input: { adminId: string; lineIds: string[]; note: string }): Promise<LedgerResult> {
  const note = cleanLedgerText(input.note, 300);
  if (!note) return { ok: false, error: "Say why it's cancelled." };
  const ids = [...new Set(input.lineIds.map((id) => String(id).slice(0, 40)).filter(Boolean))].slice(0, 500);
  return ready(async () => {
    const lines = await db.payoutLine.findMany({ where: { id: { in: ids }, status: "owed" } });
    if (!lines.length) return { ok: false as const, error: "Only lines still owed can be cancelled." };
    const updated = await db.payoutLine.updateMany({ where: { id: { in: lines.map((line) => line.id) }, status: "owed" }, data: { status: "void", note } });
    await logForEarners(input.adminId, lines, "payout_void", (total) => `₦${total.toLocaleString("en-NG")} cancelled · ${note}`);
    return { ok: true as const, count: updated.count };
  });
}

/** Finds a person by email or phone (as typed), for adding a reward. */
async function findEarner(who: string) {
  const text = who.trim();
  if (!text) return null;
  if (text.includes("@")) return db.user.findFirst({ where: { email: { equals: text, mode: "insensitive" } }, select: { id: true, phone: true } });
  const phone = cleanAirtimePhone(text);
  if (!phone) return null;
  const national = phone.slice(4);
  return db.user.findFirst({ where: { OR: [{ phone }, { phone: `0${national}` }, { phone: `234${national}` }, { phone: national }] }, select: { id: true, phone: true } });
}

/** Adds an airtime reward or an adjustment for any user, on the open Friday's list. */
export async function addReward(input: { adminId: string; who: string; kind: string; amount: string; phone?: string; network?: string; reason: string }): Promise<LedgerResult> {
  const earner = await findEarner(input.who);
  if (!earner) return { ok: false, error: "No account with that email or phone number." };
  const phone = input.kind === "airtime_reward" ? input.phone || earner.phone || "" : input.phone;
  const problem = rewardProblem({ kind: input.kind, amount: input.amount, phone, network: input.network, reason: input.reason });
  if (problem) return { ok: false, error: problem };
  const amount = cleanNairaAmount(input.amount, input.kind === "airtime_reward" ? AIRTIME_MAX : ADJUSTMENT_MAX) as number;
  const reason = cleanLedgerText(input.reason, 300) as string;
  return ready(async () => {
    const payday = await syncLedger();
    const batch = await batchFor(payday);
    const line = await db.payoutLine.create({
      data: {
        batchId: batch.id,
        earnerUserId: earner.id,
        sourceKind: input.kind,
        amount,
        note: reason,
        phone: input.kind === "airtime_reward" ? cleanAirtimePhone(phone) : null,
        network: input.kind === "airtime_reward" ? String(input.network) : null,
        createdBy: input.adminId,
      },
    });
    await logDataAccess({ adminId: input.adminId, subjectUserId: earner.id, action: input.kind === "airtime_reward" ? "airtime_reward" : "payout_adjustment", reason: "payments", note: `₦${amount.toLocaleString("en-NG")} · ${reason} · line ${line.id}` }).catch(() => undefined);
    return { ok: true as const, count: 1 };
  });
}

/** Closes a Friday's list (paid out). Anything still owed on it carries over to the next Friday's. */
export async function closeWeek(input: { adminId: string; payday: string }): Promise<LedgerResult> {
  return ready(async () => {
    const batch = await db.payoutBatch.findUnique({ where: { weekStart: dayToDate(input.payday) } });
    if (!batch) return { ok: false as const, error: "That week has no list." };
    if (batch.status === "paid") return { ok: true as const, count: 0 };
    await db.payoutBatch.update({ where: { id: batch.id }, data: { status: "paid", closedAt: new Date(), closedBy: input.adminId } });
    await syncLedger();
    return { ok: true as const, count: 1 };
  });
}

/** One admin data access log entry per earner touched (NDPA accountability: who changed what about whom). */
async function logForEarners(adminId: string, lines: Array<{ earnerUserId: string; amount: number; id: string }>, action: string, note: (total: number) => string) {
  const byEarner = new Map<string, { total: number; ids: string[] }>();
  for (const line of lines) {
    const entry = byEarner.get(line.earnerUserId) ?? { total: 0, ids: [] };
    entry.total += line.amount;
    entry.ids.push(line.id);
    byEarner.set(line.earnerUserId, entry);
  }
  await Promise.all(
    [...byEarner.entries()].map(([subjectUserId, entry]) =>
      logDataAccess({ adminId, subjectUserId, action, reason: "payments", note: `${note(entry.total)} · ${entry.ids.length} line(s)` }).catch(() => undefined),
    ),
  );
}

/** Logs that an admin downloaded earners' bank details (the CSV), one entry per earner in it. */
export async function logLedgerExport(adminId: string, earnerIds: string[], payday: string) {
  await Promise.all(
    [...new Set(earnerIds)].slice(0, 500).map((subjectUserId) =>
      logDataAccess({ adminId, subjectUserId, action: "payout_export", reason: "payments", note: `Payout list for Friday ${payday} downloaded (bank details)` }).catch(() => undefined),
    ),
  );
}

// ─── The earner ───────────────────────────────────────────────────────────────

/** An earner's own totals from the ledger: owed to them, paid to them (airtime included). Never throws. */
export async function earnerLedger(userId: string) {
  try {
    const lines = await db.payoutLine.findMany({ where: { earnerUserId: userId, status: { in: ["owed", "paid"] } }, select: { amount: true, status: true, sourceKind: true, paidAt: true }, take: 5000 });
    return earnerSummary(lines.map((line) => ({ ...line, paidAt: ISO(line.paidAt) })));
  } catch (error) {
    if (!missingTable(error)) console.error("[payouts] could not read an earner's ledger", error);
    return null;
  }
}
