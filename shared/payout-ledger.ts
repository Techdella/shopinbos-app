// The payout and rewards ledger (Admin › Payouts, docs/migrations/2026-12-16-payout-ledger.sql): one weekly list of
// what each creator, reseller and personal shopper is owed, plus airtime rewards. During the pilot the founder pays
// out by hand every Friday from this list. Pure, so the server, the admin page, the CSV and the tests share it
// (tests/payout-ledger.test.mjs). The server side is src/lib/payouts/ledger.server.ts.
//
// Shopinbos never holds this money. A resell commission is owed BY THE SHOP to the reseller: a line says who is owed,
// how much and by which shop. Once the money has moved (the shop paid the reseller itself, or the founder paid by
// hand) an admin marks the line paid with how (bank transfer reference, airtime…). Marking a resell line paid also
// sets its ResellSale to "paid".
//
// Every line has a source kind, so creator briefs and personal shopper jobs plug in later the same way resell does
// (a sync that turns "approved" work into "owed" lines, idempotent through the (sourceKind, sourceId) unique index).
//
// Weeks: each list is a PayoutBatch named by its payday, a Friday (Africa/Lagos, UTC+1 all year). "weekStart" is
// that Friday. Owed lines always sit on the open list of the next payday (today when it's Friday and that list is
// still open); whatever isn't paid when a list is closed carries over to the next Friday's.

export const PAYOUT_SOURCE_KINDS = ["resell", "creator_brief", "personal_shopper", "airtime_reward", "adjustment"] as const;
export type PayoutSourceKind = (typeof PAYOUT_SOURCE_KINDS)[number];

export const PAYOUT_SOURCE_LABELS: Record<PayoutSourceKind, string> = {
  resell: "Resell commission",
  creator_brief: "Creator brief",
  personal_shopper: "Personal shopper",
  airtime_reward: "Airtime reward",
  adjustment: "Adjustment",
};

/** Kinds an admin adds by hand (the others come from a sync). */
export const MANUAL_SOURCE_KINDS = ["airtime_reward", "adjustment"] as const satisfies readonly PayoutSourceKind[];

export const PAYOUT_LINE_STATUSES = ["owed", "paid", "void"] as const;
export type PayoutLineStatus = (typeof PAYOUT_LINE_STATUSES)[number];

export const PAYOUT_BATCH_STATUSES = ["open", "paid"] as const;
export type PayoutBatchStatus = (typeof PAYOUT_BATCH_STATUSES)[number];

/** How the money moved. shop_paid: the shop paid its reseller directly (Shopinbos never touched it). */
export const PAYOUT_METHODS = ["bank_transfer", "shop_paid", "airtime", "cash", "other"] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export const PAYOUT_METHOD_LABELS: Record<PayoutMethod, string> = {
  bank_transfer: "Bank transfer",
  shop_paid: "The shop paid them directly",
  airtime: "Airtime",
  cash: "Cash",
  other: "Other",
};

export const AIRTIME_NETWORKS = ["mtn", "airtel", "glo", "9mobile"] as const;
export type AirtimeNetwork = (typeof AIRTIME_NETWORKS)[number];
export const AIRTIME_NETWORK_LABELS: Record<AirtimeNetwork, string> = { mtn: "MTN", airtel: "Airtel", glo: "Glo", "9mobile": "9mobile" };

/** The most one airtime reward can be (naira). */
export const AIRTIME_MAX = 20_000;
/** The most one hand-added adjustment can be (naira). */
export const ADJUSTMENT_MAX = 1_000_000;

const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const FRIDAY = 5;

export function isPayoutSourceKind(value: unknown): value is PayoutSourceKind {
  return typeof value === "string" && (PAYOUT_SOURCE_KINDS as readonly string[]).includes(value);
}

export function isPayoutMethod(value: unknown): value is PayoutMethod {
  return typeof value === "string" && (PAYOUT_METHODS as readonly string[]).includes(value);
}

export function isAirtimeNetwork(value: unknown): value is AirtimeNetwork {
  return typeof value === "string" && (AIRTIME_NETWORKS as readonly string[]).includes(value);
}

// ─── Weeks (Friday paydays, Lagos time) ───────────────────────────────────────

/** "YYYY-MM-DD" of the Lagos calendar day `now` falls on. */
export function lagosDayOf(now: Date): string {
  return new Date(now.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** A "YYYY-MM-DD" day as a Date at UTC midnight (how Postgres DATE columns come back through Prisma). */
export function dayToDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** A DATE column's value (UTC midnight) back to "YYYY-MM-DD". */
export function dateToDay(date: Date | string): string {
  return (typeof date === "string" ? new Date(date) : date).toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  return new Date(dayToDate(day).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** True when "YYYY-MM-DD" is a real day and a Friday. */
export function isFriday(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = dayToDate(day);
  return !Number.isNaN(date.getTime()) && dateToDay(date) === day && date.getUTCDay() === FRIDAY;
}

/** The payday whose list `now` belongs to: the Friday on or after today, Lagos time ("YYYY-MM-DD"). */
export function paydayFor(now: Date): string {
  const today = lagosDayOf(now);
  const weekday = dayToDate(today).getUTCDay();
  return addDays(today, (FRIDAY - weekday + 7) % 7);
}

/**
 * The open list new and unpaid lines go on: this Friday's, or next Friday's once this Friday's list was closed.
 * `closedPaydays` are the paydays already closed.
 */
export function currentPayday(now: Date, closedPaydays: Iterable<string>): string {
  const closed = new Set(closedPaydays);
  let day = paydayFor(now);
  for (let guard = 0; guard < 8 && closed.has(day); guard++) day = addDays(day, 7);
  return day;
}

/** A week from a URL (?week=YYYY-MM-DD): a Friday, or null. */
export function cleanPayday(value: unknown): string | null {
  const day = typeof value === "string" ? value.trim().slice(0, 10) : "";
  return isFriday(day) ? day : null;
}

// ─── Syncing approved work into owed lines ────────────────────────────────────

export interface ResellSaleForLedger {
  id: string;
  storeId: string;
  resellerUserId: string;
  commissionAmount: number;
  status: string;
}

export interface LedgerLineRef {
  id: string;
  sourceKind: string;
  sourceId: string | null;
  status: string;
}

export interface NewLedgerLine {
  earnerUserId: string;
  sourceKind: PayoutSourceKind;
  sourceId: string;
  storeId: string | null;
  amount: number;
}

/**
 * What a sync does with resell sales: an approved sale (the order was delivered, so the commission is owed now) with
 * no line yet gets an owed line; a line still owed whose sale was voided since (cancelled, refunded, returned) is
 * voided. Sales that are only paid-not-delivered (pending) wait. Running it twice changes nothing.
 */
export function planResellSync(sales: readonly ResellSaleForLedger[], lines: readonly LedgerLineRef[]): { create: NewLedgerLine[]; voidLineIds: string[] } {
  const lineOf = new Map(lines.filter((line) => line.sourceKind === "resell" && line.sourceId).map((line) => [line.sourceId as string, line]));
  const create: NewLedgerLine[] = [];
  const voidLineIds: string[] = [];
  for (const sale of sales) {
    const line = lineOf.get(sale.id);
    const amount = Math.max(0, Math.round(Number(sale.commissionAmount) || 0));
    if (!line) {
      if (sale.status === "approved" && amount > 0) create.push({ earnerUserId: sale.resellerUserId, sourceKind: "resell", sourceId: sale.id, storeId: sale.storeId, amount });
      continue;
    }
    if (line.status === "owed" && sale.status === "void") voidLineIds.push(line.id);
  }
  return { create, voidLineIds };
}

/** Owed lines that belong on the current list: on no list yet, or left on an earlier (or closed) one. */
export function linesToCarry<L extends { id: string; status: string; batchPayday: string | null }>(lines: readonly L[], current: string): string[] {
  return lines.filter((line) => line.status === "owed" && line.batchPayday !== current).map((line) => line.id);
}

// ─── The list, by earner ──────────────────────────────────────────────────────

export interface LedgerLine {
  id: string;
  earnerUserId: string;
  sourceKind: string;
  sourceId: string | null;
  storeId: string | null;
  amount: number;
  status: string;
  method: string | null;
  reference: string | null;
  note: string | null;
  phone: string | null;
  network: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface LedgerTotals {
  owed: number;
  paid: number;
  void: number;
  lines: number;
}

export function ledgerTotals(lines: readonly Pick<LedgerLine, "amount" | "status">[]): LedgerTotals {
  const totals: LedgerTotals = { owed: 0, paid: 0, void: 0, lines: 0 };
  for (const line of lines) {
    const amount = Math.max(0, Number(line.amount) || 0);
    totals.lines += 1;
    if (line.status === "owed") totals.owed += amount;
    else if (line.status === "paid") totals.paid += amount;
    else if (line.status === "void") totals.void += amount;
  }
  return totals;
}

export interface EarnerShopPart {
  /** The shop that owes it, or null for what Shopinbos itself gives (airtime rewards, adjustments). */
  storeId: string | null;
  owed: number;
  paid: number;
  lineIds: string[];
  owedLineIds: string[];
}

export interface EarnerGroup<L extends LedgerLine = LedgerLine> {
  earnerUserId: string;
  owed: number;
  paid: number;
  lines: L[];
  shops: EarnerShopPart[];
}

/** The list grouped by earner (most owed first, then most paid), each with a per-shop breakdown. Void lines stay listed but count for nothing. */
export function groupByEarner<L extends LedgerLine>(lines: readonly L[]): EarnerGroup<L>[] {
  const groups = new Map<string, EarnerGroup<L>>();
  for (const line of lines) {
    let group = groups.get(line.earnerUserId);
    if (!group) {
      group = { earnerUserId: line.earnerUserId, owed: 0, paid: 0, lines: [], shops: [] };
      groups.set(line.earnerUserId, group);
    }
    group.lines.push(line);
    let shop = group.shops.find((part) => part.storeId === (line.storeId ?? null));
    if (!shop) {
      shop = { storeId: line.storeId ?? null, owed: 0, paid: 0, lineIds: [], owedLineIds: [] };
      group.shops.push(shop);
    }
    shop.lineIds.push(line.id);
    const amount = Math.max(0, Number(line.amount) || 0);
    if (line.status === "owed") {
      group.owed += amount;
      shop.owed += amount;
      shop.owedLineIds.push(line.id);
    } else if (line.status === "paid") {
      group.paid += amount;
      shop.paid += amount;
    }
  }
  for (const group of groups.values()) {
    group.shops.sort((a, b) => b.owed - a.owed || b.paid - a.paid);
    group.lines.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  return [...groups.values()].sort((a, b) => b.owed - a.owed || b.paid - a.paid || a.earnerUserId.localeCompare(b.earnerUserId));
}

/** What one earner sees: owed to them and paid to them, from their ledger lines (void lines left out). */
export function earnerSummary(lines: readonly Pick<LedgerLine, "amount" | "status" | "sourceKind" | "paidAt">[]) {
  let owed = 0;
  let paid = 0;
  let airtime = 0;
  let lastPaidAt: string | null = null;
  for (const line of lines) {
    const amount = Math.max(0, Number(line.amount) || 0);
    if (line.status === "owed") owed += amount;
    else if (line.status === "paid") {
      paid += amount;
      if (line.sourceKind === "airtime_reward") airtime += amount;
      if (line.paidAt && (!lastPaidAt || line.paidAt > lastPaidAt)) lastPaidAt = line.paidAt;
    }
  }
  return { owed, paid, airtime, lastPaidAt };
}

// ─── Admin input ──────────────────────────────────────────────────────────────

/** A Nigerian phone number for airtime: +234 and 10 digits, from 080…, 234…, +234… or with spaces. Null otherwise. */
export function cleanAirtimePhone(value: unknown): string | null {
  const digits = String(value ?? "").replace(/[^\d+]/g, "").replace(/^\+/, "");
  let national = "";
  if (/^234\d{10}$/.test(digits)) national = digits.slice(3);
  else if (/^0\d{10}$/.test(digits)) national = digits.slice(1);
  else if (/^[789]\d{9}$/.test(digits)) national = digits;
  return /^[789][01]\d{8}$/.test(national) ? `+234${national}` : null;
}

/** A whole-naira amount typed by an admin ("5,000", "₦2500"), 1 to `max`. Null otherwise. */
export function cleanNairaAmount(value: unknown, max: number): number | null {
  const text = String(value ?? "").replace(/[₦,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const amount = Math.round(Number(text));
  return amount >= 1 && amount <= max ? amount : null;
}

/** Free text an admin typed (reference, note, reason): one line, trimmed, capped. */
export function cleanLedgerText(value: unknown, max = 200): string | null {
  const text = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return text || null;
}

/** Why "Mark paid" can't go ahead, or null. A bank transfer needs its reference so the payment can be traced. */
export function markPaidProblem(input: { method: unknown; reference: unknown }): string | null {
  if (!isPayoutMethod(input.method)) return "Choose how it was paid.";
  if (input.method === "bank_transfer" && !cleanLedgerText(input.reference, 120)) return "Add the bank transfer reference.";
  return null;
}

/** Why a hand-added line (airtime reward or adjustment) can't be saved, or null. */
export function rewardProblem(input: { kind: unknown; amount: unknown; phone?: unknown; network?: unknown; reason: unknown }): string | null {
  if (input.kind !== "airtime_reward" && input.kind !== "adjustment") return "Choose airtime reward or adjustment.";
  const max = input.kind === "airtime_reward" ? AIRTIME_MAX : ADJUSTMENT_MAX;
  if (cleanNairaAmount(input.amount, max) === null) return `Enter an amount from ₦1 to ₦${max.toLocaleString("en-NG")}.`;
  if (input.kind === "airtime_reward") {
    if (!cleanAirtimePhone(input.phone)) return "Enter the Nigerian phone number to send the airtime to.";
    if (!isAirtimeNetwork(input.network)) return "Choose the network.";
  }
  if (!cleanLedgerText(input.reason)) return "Say what the reward is for.";
  return null;
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

/** One CSV cell: quoted, and text that a spreadsheet would run as a formula is defused. */
export function ledgerCsvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export const LEDGER_CSV_HEAD = [
  "Payday",
  "Earner",
  "Email",
  "Phone",
  "Bank",
  "Account number",
  "Account name",
  "Owed by",
  "Kind",
  "Amount (NGN)",
  "Status",
  "Paid how",
  "Reference",
  "Paid at",
  "Airtime phone",
  "Network",
  "Note",
  "Line id",
] as const;

export interface LedgerCsvRow {
  payday: string;
  earnerName: string;
  email: string | null;
  phone: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  owedBy: string;
  line: LedgerLine;
}

export function ledgerCsv(rows: readonly LedgerCsvRow[]): string {
  const out = [LEDGER_CSV_HEAD.map(ledgerCsvCell).join(",")];
  for (const row of rows) {
    const line = row.line;
    out.push(
      [
        row.payday,
        row.earnerName,
        row.email,
        row.phone,
        row.bankName,
        row.accountNumber,
        row.accountName,
        row.owedBy,
        isPayoutSourceKind(line.sourceKind) ? PAYOUT_SOURCE_LABELS[line.sourceKind] : line.sourceKind,
        line.amount,
        line.status,
        isPayoutMethod(line.method) ? PAYOUT_METHOD_LABELS[line.method] : line.method,
        line.reference,
        line.paidAt,
        line.phone,
        isAirtimeNetwork(line.network) ? AIRTIME_NETWORK_LABELS[line.network] : line.network,
        line.note,
        line.id,
      ]
        .map(ledgerCsvCell)
        .join(","),
    );
  }
  return out.join("\r\n");
}
