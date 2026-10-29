import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { SIGN_NAME_ERROR, SignError, declineDropshipContract, signErrorMessage, signDropshipAsShop, signDropshipAsSupplier } from "@/lib/contracts/contracts.server";
import { cleanSignedName } from "@shared/contracts";
import { AGREEMENT_VERSION, isStockCheck, nearness, sellerHasPlace, supplierRisk, type Nearness, type RiskLevel, type RiskReason } from "@shared/supplier-trust";

// Who sellers can dropship from, and the checks before they list (shared/supplier-trust.ts has the rules):
//   - only suppliers close to the seller show (for now), verified or not, so the seller can go and see the stock;
//   - each supplier carries its verification status and risk score, so an unverified one is never a surprise;
//   - listing a supplier's products to dropship needs the Dropship agreement: the seller called the supplier,
//     checked the stock (a visit or a video call) and agreed, and the supplier agreed too. Every way of adding a
//     product (web, phone, the older API routes) goes through listingCheck.
// Wholesale stays with verified suppliers only (src/lib/supplier-orders/wholesale.server.ts).

/** Suppliers sellers can find: active, shown by admin, not rejected or suspended, and not paused for money long overdue. */
export const VISIBLE_SUPPLIER = {
  status: "active",
  marketplaceVisible: true,
  verificationStatus: { notIn: ["rejected", "suspended"] },
  user: { debtPausedAt: null },
} satisfies Prisma.SupplierWhereInput;

export interface SupplierTrust {
  verified: boolean;
  verificationStatus: string;
  risk: { score: number; level: RiskLevel; reasons: RiskReason[] };
}

/** The verification status and risk score of each supplier, worked out together for a list. Never throws. */
export async function supplierTrust(supplierIds: string[], now = new Date()): Promise<Map<string, SupplierTrust>> {
  const ids = [...new Set(supplierIds)];
  const out = new Map<string, SupplierTrust>();
  if (!ids.length) return out;
  try {
    const suppliers = await db.supplier.findMany({
      where: { id: { in: ids } },
      select: { id: true, userId: true, verificationStatus: true, createdAt: true, rating: true, ratingCount: true, missedOrders: true, returnPolicy: true },
    });
    const userIds = suppliers.map((row) => row.userId);
    const [dropshipSent, wholesaleSent, notSent, owing, wallets] = await Promise.all([
      db.supplierOrder.groupBy({ by: ["supplierId"], where: { supplierId: { in: ids }, status: { in: ["shipped", "delivered"] } }, _count: { _all: true } }),
      db.wholesaleOrder.groupBy({ by: ["supplierId"], where: { supplierId: { in: ids }, status: { in: ["shipped", "delivered"] } }, _count: { _all: true } }),
      db.businessDebt.groupBy({ by: ["debtorUserId"], where: { debtorUserId: { in: userIds }, reason: "not_sent" }, _count: { _all: true } }),
      db.businessDebt.findMany({ where: { debtorUserId: { in: userIds }, status: "open", dueAt: { lte: now } }, select: { debtorUserId: true, amountKobo: true, paidKobo: true } }),
      db.wallet.findMany({ where: { userId: { in: userIds }, status: "active", subaccountStatus: "active" }, select: { userId: true } }),
    ]);
    const count = (rows: Array<{ _count: { _all: number } } & Record<string, unknown>>, key: string, value: string) => rows.find((row) => row[key] === value)?._count._all ?? 0;
    const active = new Set(wallets.map((row) => row.userId));
    for (const supplier of suppliers) {
      const overdueKobo = owing.filter((row) => row.debtorUserId === supplier.userId).reduce((sum, row) => sum + Math.max(0, row.amountKobo - row.paidKobo), 0);
      out.set(supplier.id, {
        verified: supplier.verificationStatus === "verified",
        verificationStatus: supplier.verificationStatus,
        risk: supplierRisk({
          verificationStatus: supplier.verificationStatus,
          createdAt: supplier.createdAt,
          ordersSent: count(dropshipSent, "supplierId", supplier.id) + count(wholesaleSent, "supplierId", supplier.id),
          rating: supplier.rating,
          ratingCount: supplier.ratingCount,
          missedOrders: supplier.missedOrders,
          notSent: count(notSent, "debtorUserId", supplier.userId),
          overdueKobo,
          hasReturnPolicy: Boolean(supplier.returnPolicy?.trim()),
          walletActive: active.has(supplier.userId),
          now,
        }),
      });
    }
  } catch (error) {
    console.error("[supplier trust] could not work out risk scores", error);
  }
  return out;
}

/** Where the seller is: the store's city, else the account's. */
export async function sellerPlace(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { city: true, store: { select: { city: true } } } });
  return { city: user?.store?.city || user?.city || null, address: null };
}

export { nearness, sellerHasPlace, type Nearness };

// ─── Agreements ───────────────────────────────────────────────────────────────

export type AgreementView = { status: string; stockCheck: string; sellerAgreedAt: string; supplierAgreedAt: string | null; supplierNote: string | null } | null;

export async function agreementWith(sellerId: string, supplierId: string): Promise<AgreementView> {
  const row = await db.supplierAgreement.findUnique({ where: { sellerId_supplierId: { sellerId, supplierId } } });
  return row ? { status: row.status, stockCheck: row.stockCheck, sellerAgreedAt: row.sellerAgreedAt.toISOString(), supplierAgreedAt: row.supplierAgreedAt?.toISOString() ?? null, supplierNote: row.supplierNote } : null;
}

/** The supplier's phone to call before agreeing (WhatsApp number first), shown to the seller only on this step. */
export async function supplierContact(supplierId: string) {
  const row = await db.supplier.findUnique({ where: { id: supplierId }, select: { whatsappNumber: true, address: true, city: true, user: { select: { phone: true } } } });
  return { phone: row?.whatsappNumber || row?.user.phone || null, address: [row?.address, row?.city].filter(Boolean).join(", ") || null };
}

export type GateResult = { ok: true } | { ok: false; code: "AGREEMENT_NEEDED" | "AGREEMENT_WAITING" | "AGREEMENT_DECLINED" | "TOO_FAR" | "NO_PLACE" | "PAUSED" | "NOT_AVAILABLE"; message: string };

/**
 * Whether this seller can list this supplier's products to dropship now. Every add-to-store path calls it, so the
 * call, the stock check and both sides' agreement come before any listing.
 */
export async function listingCheck(sellerId: string, supplierId: string): Promise<GateResult> {
  const [supplier, seller, agreement, sellerUser] = await Promise.all([
    db.supplier.findFirst({ where: { id: supplierId, ...VISIBLE_SUPPLIER }, select: { displayName: true } }),
    sellerPlace(sellerId),
    db.supplierAgreement.findUnique({ where: { sellerId_supplierId: { sellerId, supplierId } }, select: { status: true } }),
    db.user.findUnique({ where: { id: sellerId }, select: { debtPausedAt: true } }),
  ]);
  if (!supplier) return { ok: false, code: "NOT_AVAILABLE", message: "This supplier isn't taking new shops right now." };
  if (sellerUser?.debtPausedAt) return { ok: false, code: "PAUSED", message: "Pay what you owe in your Shopinbos Wallet before listing new supplier products." };
  // Far suppliers are allowed too (delivery from them may cost more); the city is what the distance is measured from.
  if (!sellerHasPlace(seller)) return { ok: false, code: "NO_PLACE", message: "Add your city in Settings first, so we can show how far each supplier is from you." };
  if (agreement?.status === "active") return { ok: true };
  if (agreement?.status === "requested") return { ok: false, code: "AGREEMENT_WAITING", message: `Waiting for ${supplier.displayName} to accept the Dropship agreement. You can list once they do.` };
  if (agreement?.status === "declined") return { ok: false, code: "AGREEMENT_DECLINED", message: `${supplier.displayName} didn't accept the Dropship agreement. Call them, then send it again.` };
  return { ok: false, code: "AGREEMENT_NEEDED", message: `Call ${supplier.displayName}, check the stock and agree the Dropship agreement before you list their products.` };
}

export type AgreementResult = { ok: true; message: string } | { ok: false; error: string };

/** The seller called the supplier, checked the stock and agrees: the agreement goes to the supplier to accept. */
export async function requestAgreement(seller: { id: string; name?: string | null }, input: { supplierId: string; called: boolean; stockCheck: string; agreed: boolean; note?: string; signedName?: string }): Promise<AgreementResult> {
  if (!input.called) return { ok: false, error: "Call the supplier first, so you know who you're working with." };
  if (!isStockCheck(input.stockCheck)) return { ok: false, error: "Say how you checked the stock: a visit or a video call." };
  if (!input.agreed) return { ok: false, error: "Tick the box to accept the Dropship agreement." };
  // The web asks for a typed name; phone apps from before written contracts sign with the account name.
  if (input.signedName !== undefined && !cleanSignedName(input.signedName)) return { ok: false, error: SIGN_NAME_ERROR };
  const supplier = await db.supplier.findFirst({ where: { id: input.supplierId, ...VISIBLE_SUPPLIER }, select: { id: true, userId: true, displayName: true } });
  if (!supplier) return { ok: false, error: "This supplier isn't taking new shops right now." };
  const place = await sellerPlace(seller.id);
  if (!sellerHasPlace(place)) return { ok: false, error: "Add your city in Settings first." };
  const existing = await db.supplierAgreement.findUnique({ where: { sellerId_supplierId: { sellerId: seller.id, supplierId: supplier.id } }, select: { status: true } });
  if (existing?.status === "active") return { ok: true, message: "You already have an agreement with this supplier." };
  const now = new Date();
  const data = { status: "requested", version: AGREEMENT_VERSION, stockCheck: input.stockCheck, calledAt: now, sellerAgreedAt: now, sellerNote: input.note?.trim().slice(0, 600) || null, supplierAgreedAt: null, supplierNote: null, declinedAt: null };
  // The agreement request and the shop's signed copy of the Dropship agreement are saved together.
  const signed = await db.$transaction(async (tx) => {
    const row = await tx.supplierAgreement.upsert({ where: { sellerId_supplierId: { sellerId: seller.id, supplierId: supplier.id } }, create: { sellerId: seller.id, supplierId: supplier.id, ...data }, update: data, select: { id: true } });
    const contract = await signDropshipAsShop(tx, { agreementId: row.id, sellerId: seller.id, supplierId: supplier.id, stockCheck: input.stockCheck, sellerNote: data.sellerNote, signer: { userId: seller.id, typedName: input.signedName, accountName: seller.name } });
    if (!contract.ok) throw new SignError(contract.error);
    return { id: contract.data.contractId };
  }).catch((error: unknown) => ({ error: signErrorMessage(error) }));
  if ("error" in signed) return { ok: false, error: signed.error };
  const shop = await db.store.findUnique({ where: { userId: seller.id }, select: { name: true } });
  await createNotification({
    userId: supplier.userId,
    type: "dropshipping",
    priority: "warning",
    title: `${shop?.name ?? "A shop"} wants to sell your products`,
    description: "They called you, checked your stock and signed the Dropship agreement. Read it and sign so they can list your products.",
    link: "/supplier/agreements",
    event: "agreement.requested",
  }).catch(() => null);
  return { ok: true, message: `Signed and sent to ${supplier.displayName}. You can list their products once they sign too. Your copy is under Contracts.` };
}

/** The supplier accepts the agreement (the shop can list their products) or declines it, saying why. */
export async function answerAgreement(supplierUser: { id: string; name?: string | null }, agreementId: string, accept: boolean, note?: string, signedName?: string): Promise<AgreementResult> {
  const supplier = await db.supplier.findUnique({ where: { userId: supplierUser.id }, select: { id: true, displayName: true } });
  if (!supplier) return { ok: false, error: "Finish setting up your supplier account first." };
  const text = note?.trim().slice(0, 600) ?? "";
  if (!accept && text.length < 5) return { ok: false, error: "Say why, so the shop knows what to fix." };
  if (accept && signedName !== undefined && !cleanSignedName(signedName)) return { ok: false, error: SIGN_NAME_ERROR };
  const now = new Date();
  // Accepting signs the shop's copy of the Dropship agreement; declining declines it. Both in one go.
  const answered = await db.$transaction(async (tx) => {
    const moved = await tx.supplierAgreement.updateMany({
      where: { id: agreementId, supplierId: supplier.id, status: "requested" },
      data: accept ? { status: "active", supplierAgreedAt: now, supplierNote: null, version: AGREEMENT_VERSION } : { status: "declined", declinedAt: now, supplierNote: text },
    });
    if (!moved.count) return false;
    if (accept) {
      const signed = await signDropshipAsSupplier(tx, { agreementId, supplierUserId: supplierUser.id, signer: { userId: supplierUser.id, typedName: signedName, accountName: supplierUser.name } });
      if (!signed.ok) throw new SignError(signed.error);
    } else {
      await declineDropshipContract(tx, { agreementId, supplierUserId: supplierUser.id, note: text });
    }
    return true;
  }).catch((error: unknown) => signErrorMessage(error));
  if (typeof answered === "string") return { ok: false, error: answered };
  if (!answered) return { ok: false, error: "This request has already been answered." };
  const row = await db.supplierAgreement.findUnique({ where: { id: agreementId }, select: { sellerId: true } });
  if (row) {
    await createNotification({
      userId: row.sellerId,
      type: "dropshipping",
      priority: accept ? "info" : "warning",
      title: accept ? `${supplier.displayName} accepted your Dropship agreement` : `${supplier.displayName} declined your Dropship agreement`,
      description: accept ? "You both signed. You can now list their products in your store, and your copy is under Contracts." : `They said: "${text}".`,
      link: "/marketplace",
      event: "agreement.answered",
    }).catch(() => null);
  }
  return { ok: true, message: accept ? "Signed. The shop can now list your products, and your copy is under Contracts." : "Declined. We've told the shop why." };
}

export interface SupplierAgreementRow {
  id: string;
  status: string;
  shopName: string;
  shopCity: string | null;
  phone: string | null;
  stockCheck: string;
  sellerNote: string | null;
  supplierNote: string | null;
  createdAt: string;
  products: number;
  /** The latest written Dropship agreement for this request (to read and sign), and its status. */
  contractId: string | null;
  contractStatus: string | null;
}

/** The shops that asked to dropship this supplier's products (requests first). */
export async function agreementsForSupplier(supplierId: string): Promise<SupplierAgreementRow[]> {
  const rows = await db.supplierAgreement.findMany({
    where: { supplierId },
    orderBy: [{ status: "desc" }, { updatedAt: "desc" }],
    take: 100,
    include: { seller: { select: { id: true, phone: true, city: true, store: { select: { name: true, city: true } } } } },
  });
  const listed = rows.length
    ? await db.dropshipRelationship.groupBy({ by: ["sellerId"], where: { supplierId, sellerId: { in: rows.map((row) => row.sellerId) } }, _count: { _all: true } })
    : [];
  const contracts = rows.length
    ? await db.contract.findMany({ where: { supplierAgreementId: { in: rows.map((row) => row.id) } }, orderBy: { createdAt: "desc" }, select: { id: true, supplierAgreementId: true, status: true } })
    : [];
  const order = (status: string) => (status === "requested" ? 0 : status === "active" ? 1 : 2);
  return rows
    .map((row) => ({
      id: row.id,
      status: row.status,
      shopName: row.seller.store?.name ?? "A shop",
      shopCity: row.seller.store?.city || row.seller.city || null,
      phone: row.seller.phone,
      stockCheck: row.stockCheck,
      sellerNote: row.sellerNote,
      supplierNote: row.supplierNote,
      createdAt: row.createdAt.toISOString(),
      products: listed.find((item) => item.sellerId === row.sellerId)?._count._all ?? 0,
      contractId: contracts.find((item) => item.supplierAgreementId === row.id)?.id ?? null,
      contractStatus: contracts.find((item) => item.supplierAgreementId === row.id)?.status ?? null,
    }))
    .sort((a, b) => order(a.status) - order(b.status));
}

// ─── Finding products near the seller ─────────────────────────────────────────

type Decoratable = { supplier: { id: string | null; city: string; verificationStatus?: string; risk?: unknown; km?: number | null; area?: string | null; far?: boolean; agreed?: boolean } };

/**
 * Products from suppliers near the seller first, then far ones (marked `far`: delivery from them may cost more), with
 * what the seller needs to judge each one: distance, verification, risk score and whether they already agreed.
 * `addresses` maps supplier id → its address. `hiddenFar` is always 0 now; kept for older phone apps.
 */
export async function nearbyForSeller<T extends Decoratable>(sellerId: string, products: T[], addresses: Map<string, string | null>): Promise<{ products: T[]; hasPlace: boolean; hiddenFar: number }> {
  const place = await sellerPlace(sellerId);
  if (!sellerHasPlace(place)) return { products: [], hasPlace: false, hiddenFar: products.length };
  const measured = products.flatMap((product) => {
    const id = product.supplier.id;
    if (!id) return [];
    return [{ product, distance: nearness(place, { city: product.supplier.city, address: addresses.get(id) ?? null }) }];
  });
  const near = [...measured.filter((row) => row.distance.near), ...measured.filter((row) => !row.distance.near)];
  const ids = [...new Set(near.map((row) => row.product.supplier.id!))];
  const [trust, agreements] = await Promise.all([
    supplierTrust(ids),
    ids.length ? db.supplierAgreement.findMany({ where: { sellerId, supplierId: { in: ids }, status: "active" }, select: { supplierId: true } }) : Promise.resolve([]),
  ]);
  const agreed = new Set(agreements.map((row) => row.supplierId));
  return {
    hasPlace: true,
    hiddenFar: 0,
    products: near.map(({ product, distance }) => {
      const id = product.supplier.id!;
      const info = trust.get(id);
      return { ...product, supplier: { ...product.supplier, km: distance.km, area: distance.area, far: !distance.near, risk: info?.risk ?? null, verificationStatus: info?.verificationStatus ?? product.supplier.verificationStatus, agreed: agreed.has(id) } };
    }),
  };
}
