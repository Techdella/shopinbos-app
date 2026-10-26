import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { agreementsForSupplier } from "@/lib/marketplace/agreements.server";
import { readContractDocument } from "@shared/contracts";
import { supplierForUser } from "../_shared";

export const dynamic = "force-dynamic";

// The supplier app's Dropship agreements (the web's /supplier/agreements): shops that want to sell this supplier's
// products, requests first, each with the written agreement the shop signed (to read before signing).
// GET → { agreements: [...row, document] }. Answering one: POST ./[id].
export const GET = withSupplier(async (_req: NextRequest, { user }) => {
  const supplier = await supplierForUser(user.id);
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  const rows = await agreementsForSupplier(supplier.id);
  const ids = rows.map((row) => row.contractId).filter((id): id is string => Boolean(id));
  const contracts = ids.length ? await db.contract.findMany({ where: { id: { in: ids } }, select: { id: true, body: true } }) : [];
  return ok({
    agreements: rows.map((row) => ({ ...row, document: readContractDocument(contracts.find((contract) => contract.id === row.contractId)?.body ?? null) })),
  });
});
