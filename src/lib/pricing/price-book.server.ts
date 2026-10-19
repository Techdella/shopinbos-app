import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { cleanPriceValue, formatPriceValue, isPriceKey, PRICE_KEYS, PRICE_SETTINGS, resolvePriceBook, type PriceBook, type PriceKey } from "@shared/platform-pricing";

// The live price book (shared/platform-pricing.ts): saved PlatformSetting rows over the defaults. Each server
// instance keeps it for CACHE_MS, and a save clears this instance's copy at once, so a change reaches every
// instance within that window. Reads never throw: if the database can't answer, the defaults (or the last book
// this instance read) are used, so a checkout never fails over pricing.

const CACHE_MS = 30_000;
const PREFIX = "price.";

// On globalThis, not in the module: a bundle can load this file more than once, and a save must clear every copy.
const store = globalThis as typeof globalThis & { __shopinbosPriceBook?: { book: PriceBook; at: number } | null };
const readCache = () => store.__shopinbosPriceBook ?? null;
const writeCache = (value: { book: PriceBook; at: number } | null) => {
  store.__shopinbosPriceBook = value;
};

async function loadSaved() {
  const rows = await db.platformSetting.findMany({ where: { key: { startsWith: PREFIX } }, select: { key: true, value: true } });
  return Object.fromEntries(rows.map((row) => [row.key.slice(PREFIX.length), row.value]));
}

export async function getPriceBook(): Promise<PriceBook> {
  const cached = readCache();
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.book;
  try {
    const book = resolvePriceBook(await loadSaved(), process.env);
    writeCache({ book, at: Date.now() });
    return book;
  } catch (error) {
    console.error("[pricing] couldn't read saved prices; using the last known or default prices", error);
    return readCache()?.book ?? resolvePriceBook({}, process.env);
  }
}

function rangeText(key: PriceKey) {
  const setting = PRICE_SETTINGS[key] as (typeof PRICE_SETTINGS)[PriceKey];
  return setting.kind === "number" ? ` (${formatPriceValue(key, setting.min)} to ${formatPriceValue(key, setting.max)}${"integer" in setting && setting.integer ? ", whole numbers" : ""})` : "";
}

export interface PriceChange {
  key: PriceKey;
  before: number | string;
  after: number | string;
}

/**
 * Saves the changed settings and one history row per change, in one transaction. Values are checked against
 * the registry; anything invalid is refused (nothing is saved). Returns what changed.
 */
export async function savePrices(input: Record<string, unknown>, by: { userId: string; note?: string | null }): Promise<{ ok: true; changes: PriceChange[] } | { ok: false; error: string }> {
  const current = resolvePriceBook(await loadSaved(), process.env);
  const changes: PriceChange[] = [];
  for (const [key, raw] of Object.entries(input)) {
    if (!isPriceKey(key)) continue;
    const value = cleanPriceValue(key, raw);
    if (value === null) return { ok: false, error: `${PRICE_SETTINGS[key].label}: that value isn't allowed${rangeText(key)}.` };
    if (value !== current[key]) changes.push({ key, before: current[key], after: value });
  }
  // The deposit can't be more than the launch fee after this save.
  const price = (changes.find((change) => change.key === "launch.price")?.after ?? current["launch.price"]) as number;
  const deposit = (changes.find((change) => change.key === "launch.deposit")?.after ?? current["launch.deposit"]) as number;
  if (deposit > price) return { ok: false, error: "The deposit can't be more than the launch fee." };
  if (!changes.length) return { ok: true, changes };

  const note = by.note?.trim().slice(0, 500) || null;
  await db.$transaction([
    ...changes.map((change) =>
      db.platformSetting.upsert({
        where: { key: PREFIX + change.key },
        create: { key: PREFIX + change.key, value: change.after as Prisma.InputJsonValue, updatedById: by.userId },
        update: { value: change.after as Prisma.InputJsonValue, updatedById: by.userId },
      }),
    ),
    db.platformSettingChange.createMany({
      data: changes.map((change) => ({ key: PREFIX + change.key, before: change.before as Prisma.InputJsonValue, after: change.after as Prisma.InputJsonValue, changedById: by.userId, note })),
    }),
  ]);
  writeCache(null);
  return { ok: true, changes };
}

export async function priceHistory(limit = 50) {
  const rows = await db.platformSettingChange.findMany({
    where: { key: { startsWith: PREFIX } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, key: true, before: true, after: true, note: true, createdAt: true, changedBy: { select: { name: true, email: true } } },
  });
  return rows
    .map((row) => ({ ...row, key: row.key.slice(PREFIX.length) }))
    .filter((row): row is typeof row & { key: PriceKey } => (PRICE_KEYS as string[]).includes(row.key));
}

/** Which settings have a saved value (the rest show their default). */
export async function savedPriceKeys(): Promise<Set<PriceKey>> {
  const saved = await loadSaved().catch(() => ({}));
  return new Set(Object.keys(saved).filter(isPriceKey));
}
