import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { notifyAdminsToReview } from "@/lib/notifications/events.server";
import {
  ADMIN_UNLOCK_MINUTES,
  CONTRACT_TITLE,
  DISPUTE_REASON_MIN,
  canonicalJson,
  cleanSignedName,
  contractReference,
  deliveryDocument,
  dropshipDocument,
  readContractDocument,
  type ContractDocument,
  type ContractKind,
} from "@shared/contracts";

// Contracts between businesses (shared/contracts.ts has the documents). The rules:
//   - the shop (or business) signs first, which freezes the document and its SHA-256 fingerprint; the supplier or
//     delivery partner then signs the same copy, or declines it;
//   - each side reads its own copy under Contracts (/home, /supplier, /logistics) and can raise a dispute on it;
//   - the admin team sees that a contract exists (who, what, when) but not its text or signatures, unless a dispute
//     is open: then an owner or admin gives a reason to open it, that is recorded as an event, both sides are told,
//     and the opening lasts ADMIN_UNLOCK_MINUTES. Closing the dispute seals it again.

type Tx = Prisma.TransactionClient | typeof db;
type Result<T = undefined> = T extends undefined ? { ok: true } | { ok: false; error: string } : { ok: true; data: T } | { ok: false; error: string };
export type Side = "a" | "b";

const PORTAL_LINK: Record<string, string> = { seller: "/home/contracts", supplier: "/supplier/contracts", logistics_partner: "/logistics/contracts" };
export const contractLink = (role: string, id?: string) => `${PORTAL_LINK[role] ?? "/home/contracts"}${id ? `/${id}` : ""}`;

export function documentHash(doc: ContractDocument) {
  return createHash("sha256").update(canonicalJson(doc)).digest("hex");
}

/** Where the signer is: their network address and browser, as proof of signing. Never throws. */
export async function signingContext(): Promise<{ ip: string | null; agent: string | null }> {
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || null;
    return { ip: ip?.slice(0, 64) ?? null, agent: h.get("user-agent")?.slice(0, 300) ?? null };
  } catch {
    return { ip: null, agent: null };
  }
}

export interface Signer {
  /** The account signing (the business owner or a team member). */
  userId: string;
  /** The name they typed, or null to sign with their account name (older phone apps, one-click connect). */
  typedName?: string | null;
  accountName?: string | null;
}

function signatureName(signer: Signer): string | null {
  return cleanSignedName(signer.typedName) ?? (signer.typedName ? null : cleanSignedName(signer.accountName) ?? signer.accountName?.trim().slice(0, 80) ?? null);
}

export const SIGN_NAME_ERROR = "Type your full name (first and last name) to sign.";

/** Thrown inside a transaction to roll it back and show the person `message`. */
export class SignError extends Error {}

/** Turns a SignError from a transaction back into the message to show; anything else is a real failure. */
export function signErrorMessage(error: unknown): string {
  if (error instanceof SignError) return error.message;
  throw error;
}

async function notifyParty(userId: string | null, role: string, contractId: string, title: string, description: string, event: string, priority: "info" | "warning" = "info") {
  if (!userId) return;
  await createNotification({ userId, type: role === "logistics_partner" ? "logistics" : "dropshipping", priority, title, description, link: contractLink(role, contractId), event, dedupeKey: `${event}:${contractId}:${Date.now()}` }).catch(() => null);
}

// ─── Starting and signing ─────────────────────────────────────────────────────

interface StartInput {
  kind: ContractKind;
  doc: ContractDocument;
  partyA: { userId: string; role: string; name: string };
  partyB: { userId: string; role: string; name: string };
  signer: Signer;
  signedName: string;
  supplierAgreementId?: string;
  deliveryConnectionId?: string;
}

async function startContract(tx: Tx, input: StartInput) {
  const ctx = await signingContext();
  const now = new Date();
  // A newer request replaces one still waiting for the other side (the old copy stays, marked replaced).
  const link = input.supplierAgreementId ? { supplierAgreementId: input.supplierAgreementId } : { deliveryConnectionId: input.deliveryConnectionId };
  await tx.contract.updateMany({ where: { ...link, status: "awaiting" }, data: { status: "declined", declinedAt: now, declineNote: "Replaced by a newer copy." } });
  return tx.contract.create({
    data: {
      kind: input.kind,
      version: input.doc.version,
      title: input.doc.title,
      body: input.doc as unknown as Prisma.InputJsonValue,
      bodyHash: documentHash(input.doc),
      status: "awaiting",
      supplierAgreementId: input.supplierAgreementId ?? null,
      deliveryConnectionId: input.deliveryConnectionId ?? null,
      partyAUserId: input.partyA.userId,
      partyARole: input.partyA.role,
      partyAName: input.partyA.name,
      partyASignedName: input.signedName,
      partyASignedAt: now,
      partyASignerId: input.signer.userId,
      partyAIp: ctx.ip,
      partyAUserAgent: ctx.agent,
      partyBUserId: input.partyB.userId,
      partyBRole: input.partyB.role,
      partyBName: input.partyB.name,
      events: { create: { action: "signed", actorSide: "a", actorUserId: input.signer.userId, actorName: input.signedName, ip: ctx.ip } },
    },
    select: { id: true },
  });
}

/**
 * The shop signs the Dropship agreement for a SupplierAgreement request (src/lib/marketplace/agreements.server.ts
 * requestAgreement). Returns the contract id.
 */
export async function signDropshipAsShop(tx: Tx, input: { agreementId: string; sellerId: string; supplierId: string; stockCheck: string; sellerNote: string | null; signer: Signer }): Promise<Result<{ contractId: string }>> {
  const signedName = signatureName(input.signer);
  if (!signedName) return { ok: false, error: SIGN_NAME_ERROR };
  const [store, seller, supplier] = await Promise.all([
    tx.store.findUnique({ where: { userId: input.sellerId }, select: { name: true, city: true } }),
    tx.user.findUnique({ where: { id: input.sellerId }, select: { name: true, city: true } }),
    tx.supplier.findUnique({ where: { id: input.supplierId }, select: { userId: true, displayName: true, city: true, address: true, returnPolicy: true } }),
  ]);
  if (!supplier) return { ok: false, error: "This supplier isn't taking new shops right now." };
  const shopName = store?.name || seller?.name || "The Shop";
  const doc = dropshipDocument({
    shop: { name: shopName, city: store?.city || seller?.city },
    supplier: { name: supplier.displayName, city: supplier.city, address: supplier.address },
    stockCheck: input.stockCheck,
    sellerNote: input.sellerNote,
    returnPolicy: supplier.returnPolicy,
    date: new Date(),
  });
  const row = await startContract(tx, {
    kind: "dropship",
    doc,
    partyA: { userId: input.sellerId, role: "seller", name: shopName },
    partyB: { userId: supplier.userId, role: "supplier", name: supplier.displayName },
    signer: input.signer,
    signedName,
    supplierAgreementId: input.agreementId,
  });
  return { ok: true, data: { contractId: row.id } };
}

/** The business signs the Delivery service agreement when it connects a delivery partner (connectPartner). */
export async function signDeliveryAsBusiness(input: { connectionId: string; owner: { id: string; role: string }; partnerId: string; signer: Signer }): Promise<Result<{ contractId: string }>> {
  const [store, supplier, user, partner] = await Promise.all([
    input.owner.role === "seller" ? db.store.findUnique({ where: { userId: input.owner.id }, select: { name: true, city: true } }) : null,
    input.owner.role === "supplier" ? db.supplier.findUnique({ where: { userId: input.owner.id }, select: { displayName: true, city: true, address: true } }) : null,
    db.user.findUnique({ where: { id: input.owner.id }, select: { name: true, city: true } }),
    db.logisticsPartner.findUnique({ where: { id: input.partnerId }, select: { userId: true, displayName: true, companyName: true, address: true, cacNumber: true } }),
  ]);
  if (!partner) return { ok: false, error: "This delivery partner isn't available right now." };
  const signedName = signatureName({ ...input.signer, accountName: input.signer.accountName ?? user?.name });
  if (!signedName) return { ok: false, error: SIGN_NAME_ERROR };
  const businessName = store?.name || supplier?.displayName || user?.name || "The Business";
  const doc = deliveryDocument({
    business: { name: businessName, role: input.owner.role === "supplier" ? "supplier" : "seller", city: store?.city || supplier?.city || user?.city, address: supplier?.address },
    partner: { name: partner.displayName, companyName: partner.companyName, address: partner.address, cacNumber: partner.cacNumber },
    date: new Date(),
  });
  const row = await startContract(db, {
    kind: "delivery",
    doc,
    partyA: { userId: input.owner.id, role: input.owner.role, name: businessName },
    partyB: { userId: partner.userId, role: "logistics_partner", name: partner.displayName },
    signer: input.signer,
    signedName,
    deliveryConnectionId: input.connectionId,
  });
  await notifyParty(partner.userId, "logistics_partner", row.id, `${businessName} signed a Delivery service agreement with you`, "Read it and sign your copy under Contracts.", "contract.to_sign", "warning");
  return { ok: true, data: { contractId: row.id } };
}

/** The supplier signs (accepts) the Dropship agreement for a request, inside answerAgreement's transaction. */
export async function signDropshipAsSupplier(tx: Tx, input: { agreementId: string; supplierUserId: string; signer: Signer }): Promise<Result> {
  const signedName = signatureName(input.signer);
  if (!signedName) return { ok: false, error: SIGN_NAME_ERROR };
  const contract = await tx.contract.findFirst({ where: { supplierAgreementId: input.agreementId, partyBUserId: input.supplierUserId, status: "awaiting" }, orderBy: { createdAt: "desc" }, select: { id: true } });
  // Requests from before written contracts have no copy to sign: accepting still works, and the shop can sign a
  // written copy later from Contracts.
  if (!contract) return { ok: true };
  return signAsB(tx, contract.id, input.supplierUserId, input.signer, signedName);
}

async function signAsB(tx: Tx, contractId: string, userId: string, signer: Signer, signedName: string): Promise<Result> {
  const ctx = await signingContext();
  const now = new Date();
  const moved = await tx.contract.updateMany({
    where: { id: contractId, partyBUserId: userId, status: "awaiting" },
    data: { status: "signed", partyBSignedName: signedName, partyBSignedAt: now, partyBSignerId: signer.userId, partyBIp: ctx.ip, partyBUserAgent: ctx.agent },
  });
  if (!moved.count) return { ok: false, error: "This contract has already been answered." };
  await tx.contractEvent.create({ data: { contractId, action: "signed", actorSide: "b", actorUserId: signer.userId, actorName: signedName, ip: ctx.ip } });
  return { ok: true };
}

/** The supplier declined the request: its waiting copy is declined too. */
export async function declineDropshipContract(tx: Tx, input: { agreementId: string; supplierUserId: string; note: string }) {
  const now = new Date();
  const rows = await tx.contract.findMany({ where: { supplierAgreementId: input.agreementId, partyBUserId: input.supplierUserId, status: "awaiting" }, select: { id: true } });
  if (!rows.length) return;
  await tx.contract.updateMany({ where: { id: { in: rows.map((row) => row.id) } }, data: { status: "declined", declinedAt: now, declineNote: input.note } });
  await tx.contractEvent.createMany({ data: rows.map((row) => ({ contractId: row.id, action: "declined", actorSide: "b", actorUserId: input.supplierUserId, note: input.note })) });
}

/** The delivery partner signs or declines a Delivery service agreement from their Contracts page. */
export async function answerAsPartyB(user: { id: string; name?: string | null }, contractId: string, input: { accept: boolean; typedName?: unknown; note?: unknown }): Promise<Result> {
  const contract = await db.contract.findFirst({ where: { id: contractId, partyBUserId: user.id }, select: { id: true, kind: true, status: true, partyAUserId: true, partyARole: true, partyBName: true, supplierAgreementId: true } });
  if (!contract) return { ok: false, error: "We couldn't find that contract." };
  if (contract.status !== "awaiting") return { ok: false, error: "This contract has already been answered." };
  // A supplier accepts a Dropship agreement where they accept the shop's request, so the listing opens too.
  if (contract.kind === "dropship") return { ok: false, error: "Accept or decline this shop's request under Dropship agreements." };
  if (!input.accept) {
    const note = typeof input.note === "string" ? input.note.trim().slice(0, 600) : "";
    if (note.length < 5) return { ok: false, error: "Say why, so they know what to fix." };
    await db.$transaction(async (tx) => {
      await tx.contract.update({ where: { id: contract.id }, data: { status: "declined", declinedAt: new Date(), declineNote: note } });
      await tx.contractEvent.create({ data: { contractId: contract.id, action: "declined", actorSide: "b", actorUserId: user.id, note } });
    });
    await notifyParty(contract.partyAUserId, contract.partyARole, contract.id, `${contract.partyBName} declined the Delivery service agreement`, `They said: "${note}".`, "contract.declined", "warning");
    return { ok: true };
  }
  const signedName = cleanSignedName(input.typedName);
  if (!signedName) return { ok: false, error: SIGN_NAME_ERROR };
  const result = await db.$transaction((tx) => signAsB(tx, contract.id, user.id, { userId: user.id, typedName: signedName }, signedName));
  if (result.ok) await notifyParty(contract.partyAUserId, contract.partyARole, contract.id, `${contract.partyBName} signed your Delivery service agreement`, "Both of you have signed. Your copy is under Contracts.", "contract.signed");
  return result;
}

/** A delivery connection ended: its contracts end too (the signed copies stay). */
export async function endDeliveryContracts(connectionId: string, side: Side | "admin") {
  const rows = await db.contract.findMany({ where: { deliveryConnectionId: connectionId, status: { in: ["awaiting", "signed"] } }, select: { id: true } });
  if (!rows.length) return;
  await db.contract.updateMany({ where: { id: { in: rows.map((row) => row.id) } }, data: { status: "ended", endedAt: new Date() } });
  await db.contractEvent.createMany({ data: rows.map((row) => ({ contractId: row.id, action: "ended", actorSide: side })) });
}

/**
 * The shop signs a written copy for a Dropship agreement both sides accepted before written contracts existed
 * (or after the old copy was declined as replaced): it goes to the supplier like a new one. Only the shop starts it.
 */
export async function signWrittenCopy(user: { id: string; name?: string | null; role: string }, input: { agreementId?: string; connectionId?: string; typedName?: unknown }): Promise<Result<{ contractId: string }>> {
  const signer: Signer = { userId: user.id, typedName: typeof input.typedName === "string" ? input.typedName : "", accountName: user.name };
  if (!cleanSignedName(signer.typedName)) return { ok: false, error: SIGN_NAME_ERROR };
  if (input.agreementId) {
    const agreement = await db.supplierAgreement.findFirst({ where: { id: input.agreementId, sellerId: user.id, status: "active" }, select: { id: true, supplierId: true, stockCheck: true, sellerNote: true, supplier: { select: { userId: true, displayName: true } } } });
    if (!agreement) return { ok: false, error: "We couldn't find that agreement." };
    const existing = await db.contract.count({ where: { supplierAgreementId: agreement.id, status: { in: ["awaiting", "signed"] } } });
    if (existing) return { ok: false, error: "There's already a written copy for this agreement." };
    const result = await signDropshipAsShop(db, { agreementId: agreement.id, sellerId: user.id, supplierId: agreement.supplierId, stockCheck: agreement.stockCheck, sellerNote: agreement.sellerNote, signer });
    if (result.ok) await notifyParty(agreement.supplier.userId, "supplier", result.data.contractId, "A shop signed a written Dropship agreement with you", "You already work together. Read it and sign your copy under Contracts.", "contract.to_sign", "warning");
    return result;
  }
  if (input.connectionId) {
    const connection = await db.deliveryConnection.findFirst({ where: { id: input.connectionId, ownerUserId: user.id, status: "active" }, select: { id: true, logisticsPartnerId: true } });
    if (!connection) return { ok: false, error: "We couldn't find that delivery partner." };
    const existing = await db.contract.count({ where: { deliveryConnectionId: connection.id, status: { in: ["awaiting", "signed"] } } });
    if (existing) return { ok: false, error: "There's already a written copy for this delivery partner." };
    return signDeliveryAsBusiness({ connectionId: connection.id, owner: { id: user.id, role: user.role }, partnerId: connection.logisticsPartnerId, signer });
  }
  return { ok: false, error: "Choose what to sign." };
}

/** Countersigning a written copy of a Dropship agreement that's already active (no request to accept any more). */
export async function signActiveDropshipCopy(user: { id: string }, contractId: string, typedName: unknown): Promise<Result> {
  const contract = await db.contract.findFirst({ where: { id: contractId, partyBUserId: user.id, kind: "dropship", status: "awaiting" }, select: { id: true, supplierAgreementId: true, partyAUserId: true, partyBName: true } });
  if (!contract?.supplierAgreementId) return { ok: false, error: "We couldn't find that contract." };
  const agreement = await db.supplierAgreement.findUnique({ where: { id: contract.supplierAgreementId }, select: { status: true } });
  if (agreement?.status !== "active") return { ok: false, error: "Accept or decline this shop's request under Dropship agreements." };
  const signedName = cleanSignedName(typedName);
  if (!signedName) return { ok: false, error: SIGN_NAME_ERROR };
  const result = await db.$transaction((tx) => signAsB(tx, contract.id, user.id, { userId: user.id, typedName: signedName }, signedName));
  if (result.ok) await notifyParty(contract.partyAUserId, "seller", contract.id, `${contract.partyBName} signed your Dropship agreement`, "Both of you have signed. Your copy is under Contracts.", "contract.signed");
  return result;
}

// ─── Reading (the two sides) ──────────────────────────────────────────────────

const LIST_SELECT = {
  id: true, kind: true, title: true, status: true, version: true, createdAt: true, updatedAt: true,
  partyAUserId: true, partyARole: true, partyAName: true, partyASignedAt: true,
  partyBUserId: true, partyBRole: true, partyBName: true, partyBSignedAt: true,
  disputeStatus: true, supplierAgreementId: true, deliveryConnectionId: true,
} satisfies Prisma.ContractSelect;

export type ContractListRow = Prisma.ContractGetPayload<{ select: typeof LIST_SELECT }> & { side: Side; reference: string; otherName: string };

/** Every contract this business is a side of, newest first. */
export async function contractsFor(userId: string): Promise<ContractListRow[]> {
  const rows = await db.contract.findMany({ where: { OR: [{ partyAUserId: userId }, { partyBUserId: userId }] }, orderBy: { createdAt: "desc" }, take: 200, select: LIST_SELECT });
  return rows.map((row) => {
    const side: Side = row.partyAUserId === userId ? "a" : "b";
    return { ...row, side, reference: contractReference(row.kind, row.id), otherName: side === "a" ? row.partyBName : row.partyAName };
  });
}

/** Relationships still working on an older acceptance with no written copy yet (the shop or business can sign one). */
export async function unwrittenFor(userId: string, role: string) {
  if (role !== "seller" && role !== "supplier") return { agreements: [], connections: [] };
  const [agreements, connections] = await Promise.all([
    role === "seller"
      ? db.supplierAgreement.findMany({ where: { sellerId: userId, status: "active" }, select: { id: true, supplierAgreedAt: true, supplier: { select: { displayName: true } } } })
      : Promise.resolve([]),
    db.deliveryConnection.findMany({ where: { ownerUserId: userId, status: "active" }, select: { id: true, createdAt: true, logisticsPartner: { select: { displayName: true } } } }),
  ]);
  const written = await db.contract.findMany({
    where: { status: { in: ["awaiting", "signed"] }, OR: [{ supplierAgreementId: { in: agreements.map((row) => row.id) } }, { deliveryConnectionId: { in: connections.map((row) => row.id) } }] },
    select: { supplierAgreementId: true, deliveryConnectionId: true },
  });
  const agreementIds = new Set(written.map((row) => row.supplierAgreementId));
  const connectionIds = new Set(written.map((row) => row.deliveryConnectionId));
  return {
    agreements: agreements.filter((row) => !agreementIds.has(row.id)).map((row) => ({ id: row.id, name: row.supplier.displayName, since: row.supplierAgreedAt })),
    connections: connections.filter((row) => !connectionIds.has(row.id)).map((row) => ({ id: row.id, name: row.logisticsPartner.displayName, since: row.createdAt })),
  };
}

const FULL_INCLUDE = { events: { orderBy: { createdAt: "asc" } } } satisfies Prisma.ContractInclude;
export type FullContract = Prisma.ContractGetPayload<{ include: typeof FULL_INCLUDE }>;

export interface ContractCopy {
  contract: FullContract;
  doc: ContractDocument | null;
  side: Side | "admin";
  reference: string;
}

/** One side's copy of a contract, or null when this account isn't a side of it. */
export async function contractCopy(userId: string, contractId: string): Promise<ContractCopy | null> {
  const contract = await db.contract.findFirst({ where: { id: contractId, OR: [{ partyAUserId: userId }, { partyBUserId: userId }] }, include: FULL_INCLUDE });
  if (!contract) return null;
  return { contract, doc: readContractDocument(contract.body), side: contract.partyAUserId === userId ? "a" : "b", reference: contractReference(contract.kind, contract.id) };
}

/** The document still matches the fingerprint taken when the first side signed. */
export function untouched(copy: ContractCopy) {
  return Boolean(copy.doc) && documentHash(copy.doc!) === copy.contract.bodyHash;
}

// ─── Disputes ─────────────────────────────────────────────────────────────────

/** One side raises a dispute: the Shopinbos team can now open the contract to decide. */
export async function raiseDispute(user: { id: string }, contractId: string, reason: unknown): Promise<Result> {
  const text = typeof reason === "string" ? reason.trim().slice(0, 1500) : "";
  if (text.length < DISPUTE_REASON_MIN) return { ok: false, error: "Say what went wrong, so the team knows what to look at." };
  const copy = await contractCopy(user.id, contractId);
  if (!copy || copy.side === "admin") return { ok: false, error: "We couldn't find that contract." };
  const { contract } = copy;
  if (contract.status !== "signed" && contract.status !== "ended") return { ok: false, error: "Only a contract both sides signed can be disputed." };
  if (contract.disputeStatus === "open") return { ok: false, error: "There's already a dispute open on this contract." };
  await db.$transaction(async (tx) => {
    await tx.contract.update({ where: { id: contract.id }, data: { disputeStatus: "open", disputeOpenedAt: new Date(), disputeOpenedBy: copy.side, disputeReason: text, disputeClosedAt: null, disputeClosedNote: null } });
    await tx.contractEvent.create({ data: { contractId: contract.id, action: "dispute_opened", actorSide: copy.side, actorUserId: user.id, note: text } });
  });
  const raiser = copy.side === "a" ? contract.partyAName : contract.partyBName;
  const other = copy.side === "a" ? { id: contract.partyBUserId, role: contract.partyBRole } : { id: contract.partyAUserId, role: contract.partyARole };
  await notifyParty(other.id, other.role, contract.id, `${raiser} raised a dispute on your ${contract.title}`, "The Shopinbos team may now open this contract to help settle it. Send them your side in the app.", "contract.dispute", "warning");
  await notifyAdminsToReview({ title: `Contract dispute: ${copy.reference}`, description: `${raiser} raised a dispute on a ${contract.title.toLowerCase()}.`, link: `/admin/contracts/${contract.id}`, dedupeKey: `contract.dispute:${contract.id}:${Date.now()}` }).catch(() => null);
  return { ok: true };
}

/** The side that raised a dispute withdraws it (settled between them): the contract is sealed again. */
export async function withdrawDispute(user: { id: string }, contractId: string): Promise<Result> {
  const copy = await contractCopy(user.id, contractId);
  if (!copy || copy.contract.disputeStatus !== "open" || copy.contract.disputeOpenedBy !== copy.side) return { ok: false, error: "Only the side that raised the dispute can withdraw it." };
  await closeDispute(copy.contract, { side: copy.side, userId: user.id }, "Withdrawn: settled between the two sides.");
  return { ok: true };
}

async function closeDispute(contract: { id: string; title: string; partyAUserId: string | null; partyARole: string; partyBUserId: string | null; partyBRole: string }, actor: { side: Side | "admin"; userId: string }, note: string) {
  await db.$transaction(async (tx) => {
    await tx.contract.update({ where: { id: contract.id }, data: { disputeStatus: "closed", disputeClosedAt: new Date(), disputeClosedNote: note } });
    await tx.contractEvent.create({ data: { contractId: contract.id, action: "dispute_closed", actorSide: actor.side, actorUserId: actor.userId, note } });
  });
  for (const party of [{ id: contract.partyAUserId, role: contract.partyARole }, { id: contract.partyBUserId, role: contract.partyBRole }]) {
    await notifyParty(party.id, party.role, contract.id, `The dispute on your ${contract.title} is closed`, `${note} The contract is sealed again.`, "contract.dispute_closed");
  }
}

// ─── The admin team ───────────────────────────────────────────────────────────

/** What the team sees without a dispute: who, what and when. No text, notes, signatures or where they signed. */
export async function contractsForAdmin(filter: "disputes" | "all", search?: string) {
  const where: Prisma.ContractWhereInput = {
    ...(filter === "disputes" ? { disputeStatus: "open" } : {}),
    ...(search ? { OR: [{ partyAName: { contains: search, mode: "insensitive" } }, { partyBName: { contains: search, mode: "insensitive" } }] } : {}),
  };
  const rows = await db.contract.findMany({ where, orderBy: [{ disputeStatus: "desc" }, { updatedAt: "desc" }], take: 200, select: LIST_SELECT });
  return rows.map((row) => ({ ...row, reference: contractReference(row.kind, row.id) }));
}

/** The admin's opening of this disputed contract that is still running, or null (the contract stays sealed). */
async function adminOpening(adminId: string, contract: { id: string; disputeStatus: string; disputeOpenedAt: Date | null }) {
  if (contract.disputeStatus !== "open" || !contract.disputeOpenedAt) return null;
  const since = new Date(Math.max(Date.now() - ADMIN_UNLOCK_MINUTES * 60_000, contract.disputeOpenedAt.getTime()));
  return db.contractEvent.findFirst({ where: { contractId: contract.id, action: "admin_opened", actorUserId: adminId, createdAt: { gte: since } }, orderBy: { createdAt: "desc" } });
}

export type AdminContractView =
  | { sealed: true; summary: Prisma.ContractGetPayload<{ select: typeof LIST_SELECT & { disputeReason: true; disputeOpenedAt: true; disputeOpenedBy: true } }>; reference: string }
  | { sealed: false; copy: ContractCopy; openedUntil: Date; intact: boolean };

/** The admin's view: sealed (the summary only) unless a dispute is open and they opened it with a reason. */
export async function contractForAdmin(adminId: string, contractId: string): Promise<AdminContractView | null> {
  const summary = await db.contract.findUnique({ where: { id: contractId }, select: { ...LIST_SELECT, disputeReason: true, disputeOpenedAt: true, disputeOpenedBy: true } });
  if (!summary) return null;
  const reference = contractReference(summary.kind, summary.id);
  const opening = await adminOpening(adminId, summary);
  if (!opening) return { sealed: true, summary: { ...summary, disputeReason: summary.disputeStatus === "open" ? summary.disputeReason : null }, reference };
  const contract = await db.contract.findUniqueOrThrow({ where: { id: contractId }, include: FULL_INCLUDE });
  const copy: ContractCopy = { contract, doc: readContractDocument(contract.body), side: "admin", reference };
  return { sealed: false, copy, openedUntil: new Date(opening.createdAt.getTime() + ADMIN_UNLOCK_MINUTES * 60_000), intact: untouched(copy) };
}

/** An owner or admin opens a disputed contract, saying why. Recorded, and both sides are told. */
export async function adminOpenContract(admin: { id: string; name?: string | null }, contractId: string, reason: unknown): Promise<Result> {
  const text = typeof reason === "string" ? reason.trim().slice(0, 600) : "";
  if (text.length < DISPUTE_REASON_MIN) return { ok: false, error: "Write why you need to open it (at least 10 characters). Both businesses will see it." };
  const contract = await db.contract.findUnique({ where: { id: contractId }, select: { id: true, title: true, kind: true, disputeStatus: true, partyAUserId: true, partyARole: true, partyBUserId: true, partyBRole: true } });
  if (!contract) return { ok: false, error: "We couldn't find that contract." };
  if (contract.disputeStatus !== "open") return { ok: false, error: "This contract is sealed: it can only be opened while one of the businesses has a dispute open." };
  const ctx = await signingContext();
  await db.contractEvent.create({ data: { contractId: contract.id, action: "admin_opened", actorSide: "admin", actorUserId: admin.id, actorName: admin.name?.trim() || "Shopinbos team", note: text, ip: ctx.ip } });
  for (const party of [{ id: contract.partyAUserId, role: contract.partyARole }, { id: contract.partyBUserId, role: contract.partyBRole }]) {
    await notifyParty(party.id, party.role, contract.id, `The Shopinbos team opened your ${contract.title}`, `To settle the dispute: "${text}". Every opening is listed on your copy.`, "contract.admin_opened");
  }
  return { ok: true };
}

/** The team settles a dispute: the contract is sealed again. */
export async function adminCloseDispute(admin: { id: string }, contractId: string, note: unknown): Promise<Result> {
  const text = typeof note === "string" ? note.trim().slice(0, 600) : "";
  if (text.length < 5) return { ok: false, error: "Write how it was settled. Both businesses will see it." };
  const contract = await db.contract.findUnique({ where: { id: contractId }, select: { id: true, title: true, disputeStatus: true, partyAUserId: true, partyARole: true, partyBUserId: true, partyBRole: true } });
  if (!contract || contract.disputeStatus !== "open") return { ok: false, error: "There's no open dispute on this contract." };
  await closeDispute(contract, { side: "admin", userId: admin.id }, text);
  return { ok: true };
}

export { CONTRACT_TITLE };
