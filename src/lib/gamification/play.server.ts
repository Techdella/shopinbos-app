import "server-only";

import { randomBytes, randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { GameError, isMissingTable } from "./config.server";
import { orderLoyalty } from "./loyalty.server";
import {
  GAME_CODE_PREFIXES,
  canPlayAgain,
  contactKey,
  gameCode,
  pickWeighted,
  prizeDiscount,
  readGameConfig,
  sliceLabel,
  totalTickets,
  type ContactChoice,
  type GameKind,
  type GameSlice,
} from "./logic";

// One play of spin-the-wheel, the scratch card or the post-purchase spin. The server draws the outcome with a
// secure random number (the page only animates to it), checks the one-play-per-contact cap, and turns a win
// into a unique one-use Discount code that expires. Plays are recorded in GamePlay once that table exists;
// before then the cap is checked against the codes already issued to the same contact.

export interface PlayInput {
  storeId: string;
  game: GameKind;
  email?: string | null;
  phone?: string | null;
  /** Post-purchase: the order the spin is for (identity comes from the order). */
  orderId?: string | null;
  consent?: Record<string, unknown>;
  /**
   * Played from a game pop-up (Marketing > Forms and pop-ups): the route read these from the saved pop-up, so the
   * pop-up's own contact choice and play limit apply, and the game runs even when its Rewards pop-up is off.
   * Prizes, odds, code length and minimum order still come from the Rewards settings.
   */
  viaPopup?: { formId: string; collect: ContactChoice; frequencyDays: number } | null;
}

export interface PlayResult {
  sliceId: string;
  index: number;
  kind: GameSlice["kind"];
  label: string;
  won: boolean;
  code: string | null;
  expiresAt: string | null;
  minOrder: number;
  /** The free gift, so the page can offer "Add it to your bag". */
  gift: { productId: string; name: string; price: number } | null;
  message: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** When this contact last played this game (from GamePlay, else from the codes they were given). */
async function lastPlay(storeId: string, game: GameKind, key: string): Promise<Date | null> {
  try {
    const row = await db.gamePlay.findFirst({ where: { storeId, game, contactKey: key }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    return row?.createdAt ?? null;
  } catch (error) {
    if (!isMissingTable(error)) throw error;
  }
  const code = await db.discount.findFirst({
    where: { storeId, code: { startsWith: `${GAME_CODE_PREFIXES[game]}-` }, config: { path: ["game", "contact"], equals: key } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return code?.createdAt ?? null;
}

export async function orderAlreadySpun(storeId: string, orderId: string) {
  try {
    if (await db.gamePlay.findFirst({ where: { storeId, game: "post_purchase", orderId }, select: { id: true } })) return true;
  } catch (error) {
    if (!isMissingTable(error)) throw error;
  }
  return Boolean(await db.discount.findFirst({ where: { storeId, code: { startsWith: `${GAME_CODE_PREFIXES.post_purchase}-` }, config: { path: ["game", "orderId"], equals: orderId } }, select: { id: true } }));
}

export async function playGame(input: PlayInput): Promise<PlayResult> {
  const store = await db.store.findUnique({ where: { id: input.storeId }, select: { id: true, brandSettings: true, currency: true } });
  if (!store) throw new GameError("Store not found");
  const config = readGameConfig(record(store.brandSettings).gamification ?? {});

  let email = input.email?.trim().toLowerCase() || null;
  let phone = input.phone?.trim() || null;
  let frequencyDays = 0;
  if (input.game === "post_purchase") {
    if (!config.postPurchase.enabled) throw new GameError("This game isn't on right now.");
    if (!input.orderId) throw new GameError("Missing order");
    const order = await db.retailOrder.findFirst({ where: { id: input.orderId, storeId: store.id }, select: { id: true, buyerEmail: true, buyerPhone: true, status: true } });
    if (!order || order.status === "cancelled") throw new GameError("This order can't spin.");
    if (await orderAlreadySpun(store.id, order.id)) throw new GameError("You've already spun for this order.");
    email = order.buyerEmail.toLowerCase();
    phone = order.buyerPhone;
  } else {
    const popup = input.viaPopup ?? null;
    // Pick a gift box only exists as a pop-up.
    if (input.game === "box" && !popup) throw new GameError("This game isn't on right now.");
    const settings = popup ?? (input.game === "wheel" ? config.wheel : config.scratch);
    if (!popup && !(input.game === "wheel" ? config.wheel : config.scratch).enabled) throw new GameError("This game isn't on right now.");
    if (settings.collect === "email" && !email) throw new GameError("Enter your email to play.");
    if (settings.collect === "whatsapp" && !phone) throw new GameError("Enter your WhatsApp number to play.");
    frequencyDays = settings.frequencyDays;
  }
  const key = contactKey(email, phone);
  if (!key) throw new GameError(email ? "Enter a valid email address." : "Enter a valid phone number.");
  if (input.game !== "post_purchase" && !canPlayAgain(await lastPlay(store.id, input.game, key), frequencyDays)) {
    throw new GameError(`You've already played. You can play again ${frequencyDays === 1 ? "tomorrow" : `in ${frequencyDays} days`}.`);
  }

  // Free gifts only count while the product is on sale; otherwise their slice can't land.
  const slices = config.prizes.slices;
  const giftIds = slices.map((slice) => slice.productId).filter((id): id is string => Boolean(id));
  const gifts = giftIds.length
    ? await db.storeProduct.findMany({ where: { storeId: store.id, id: { in: giftIds }, status: "published", currentStock: { gt: 0 } }, select: { id: true, name: true, retailPrice: true } })
    : [];
  const giftById = new Map(gifts.map((gift) => [gift.id, gift]));
  const eligible = slices.map((slice) => slice.kind !== "free_gift" || (slice.productId ? giftById.has(slice.productId) : false));
  const weights = slices.map((slice) => slice.weight);
  const tickets = totalTickets(weights, eligible);
  if (tickets <= 0) throw new GameError("This game isn't ready yet.");
  const index = pickWeighted(weights, randomInt(tickets), eligible);
  const slice = slices[index]!;
  const gift = slice.productId ? giftById.get(slice.productId) ?? null : null;
  const prize = prizeDiscount(slice, gift?.retailPrice ?? null);
  const label = sliceLabel(slice);

  let code: string | null = null;
  let discountId: string | null = null;
  const expiresAt = prize ? new Date(Date.now() + config.prizes.codeDays * 86_400_000) : null;
  if (prize) {
    const prefix = GAME_CODE_PREFIXES[input.game];
    for (let attempt = 0; attempt < 6 && !code; attempt++) {
      const candidate = gameCode(prefix, randomBytes(8));
      const created = await db.discount
        .create({
          data: {
            storeId: store.id,
            code: candidate,
            name: `${input.game === "wheel" ? "Spin to win" : input.game === "scratch" ? "Scratch card" : input.game === "box" ? "Gift box" : "Next-order spin"}: ${label}`.slice(0, 120),
            type: prize.type,
            value: prize.value,
            minOrder: config.prizes.minOrder,
            maxUses: 1,
            startsAt: null,
            expiresAt,
            status: "active",
            config: { automatic: false, productIds: prize.productIds, game: { kind: input.game, sliceId: slice.id, contact: key, ...(input.orderId ? { orderId: input.orderId } : {}), ...(input.viaPopup ? { formId: input.viaPopup.formId } : {}) } } as unknown as Prisma.InputJsonValue,
          },
          select: { id: true, code: true },
        })
        .catch((error: { code?: string }) => {
          if (error?.code === "P2002") return null; // code already taken: draw another
          throw error;
        });
      if (created) {
        code = created.code;
        discountId = created.id;
      }
    }
    if (!code) throw new GameError("Couldn't make your code. Try again.");
  }

  await db.gamePlay
    .create({
      data: {
        storeId: store.id,
        game: input.game,
        contactKey: key,
        email,
        phone,
        outcomeId: slice.id,
        outcomeKind: slice.kind,
        outcomeLabel: label,
        discountId,
        code,
        orderId: input.orderId ?? null,
        consent: (input.consent ?? {}) as Prisma.InputJsonValue,
      },
    })
    .catch((error) => {
      if (!isMissingTable(error)) console.error("[gamification] play not recorded", error);
    });

  const won = Boolean(code);
  return {
    sliceId: slice.id,
    index,
    kind: slice.kind,
    label,
    won,
    code,
    expiresAt: expiresAt?.toISOString() ?? null,
    minOrder: won ? config.prizes.minOrder : 0,
    gift: gift && won ? { productId: gift.id, name: gift.name, price: gift.retailPrice } : null,
    message: won
      ? slice.kind === "free_gift"
        ? `You won a free ${gift?.name ?? "gift"}! Add it to your bag and use your code at checkout.`
        : `You won ${label.toLowerCase()}! Your code is ready.`
      : "So close! No prize this time.",
  };
}

/** The order page's rewards: points for this order and whether the post-purchase spin is still available. */
export async function orderRewards(store: { id: string; brandSettings: unknown }, order: { id: string; buyerEmail: string; status: string; subtotal: number; discountAmount: number | null }) {
  const config = readGameConfig(record(store.brandSettings).gamification ?? {});
  const [loyalty, spun] = await Promise.all([
    orderLoyalty(store.id, order, config.loyalty).catch((error) => {
      console.error("[gamification] order points failed", error);
      return null;
    }),
    config.postPurchase.enabled && order.status !== "cancelled" ? orderAlreadySpun(store.id, order.id).catch(() => true) : Promise.resolve(true),
  ]);
  return {
    loyalty,
    postPurchase: config.postPurchase.enabled && order.status !== "cancelled" ? { config, alreadySpun: spun } : null,
  };
}
