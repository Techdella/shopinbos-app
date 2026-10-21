"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { isFullAdmin } from "@/lib/admin-team/pure";
import {
  adminCloseDispute,
  adminOpenContract,
  answerAsPartyB,
  contractLink,
  raiseDispute,
  signActiveDropshipCopy,
  signWrittenCopy,
  withdrawDispute,
} from "@/lib/contracts/contracts.server";

// Contracts between businesses (src/lib/contracts/contracts.server.ts): signing, declining and disputes for the two
// sides, and opening or settling a disputed contract for owners and admins of the Shopinbos team.

type Result = { ok: true } | { ok: false; error: string };
const id = (value: unknown) => String(value ?? "").slice(0, 40);

async function party() {
  return requireRole(["seller", "supplier", "logistics_partner"], "/login");
}

function refresh(role: string, contractId?: string) {
  revalidatePath(contractLink(role));
  if (contractId) revalidatePath(contractLink(role, contractId));
}

/** The second side signs: a Delivery service agreement, or the written copy of a Dropship agreement already working. */
export async function signContractAction(contractId: string, typedName: string): Promise<Result> {
  const user = await party();
  const row = await db.contract.findFirst({ where: { id: id(contractId), partyBUserId: user.id }, select: { kind: true } });
  if (!row) return { ok: false, error: "We couldn't find that contract." };
  const result = row.kind === "delivery" ? await answerAsPartyB(user, id(contractId), { accept: true, typedName }) : await signActiveDropshipCopy(user, id(contractId), typedName);
  refresh(user.role, id(contractId));
  return result;
}

export async function declineContractAction(contractId: string, note: string): Promise<Result> {
  const user = await party();
  const result = await answerAsPartyB(user, id(contractId), { accept: false, note });
  refresh(user.role, id(contractId));
  return result;
}

/** The shop or business signs a written copy of a relationship from before written contracts. */
export async function signWrittenCopyAction(input: { agreementId?: string; connectionId?: string; typedName: string }): Promise<Result> {
  const user = await party();
  const result = await signWrittenCopy(user, { agreementId: input.agreementId ? id(input.agreementId) : undefined, connectionId: input.connectionId ? id(input.connectionId) : undefined, typedName: input.typedName });
  refresh(user.role);
  return result.ok ? { ok: true } : result;
}

export async function raiseDisputeAction(contractId: string, reason: string): Promise<Result> {
  const user = await party();
  const result = await raiseDispute(user, id(contractId), reason);
  refresh(user.role, id(contractId));
  return result;
}

export async function withdrawDisputeAction(contractId: string): Promise<Result> {
  const user = await party();
  const result = await withdrawDispute(user, id(contractId));
  refresh(user.role, id(contractId));
  return result;
}

// ─── The team: owners and admins only ─────────────────────────────────────────

async function fullAdmin() {
  const user = await requireRole(["admin"], "/admin/login");
  const member = await db.user.findUnique({ where: { id: user.id }, select: { adminRole: true } });
  return isFullAdmin(member?.adminRole) ? user : null;
}

export async function adminOpenContractAction(contractId: string, reason: string): Promise<Result> {
  const admin = await fullAdmin();
  if (!admin) return { ok: false, error: "Only owners and admins can open a contract." };
  const result = await adminOpenContract(admin, id(contractId), reason);
  revalidatePath(`/admin/contracts/${id(contractId)}`);
  return result;
}

export async function adminCloseDisputeAction(contractId: string, note: string): Promise<Result> {
  const admin = await fullAdmin();
  if (!admin) return { ok: false, error: "Only owners and admins can settle a dispute." };
  const result = await adminCloseDispute(admin, id(contractId), note);
  revalidatePath("/admin/contracts");
  revalidatePath(`/admin/contracts/${id(contractId)}`);
  return result;
}
