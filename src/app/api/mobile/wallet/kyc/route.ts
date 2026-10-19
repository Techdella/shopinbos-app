import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api/response";
import { verifyWalletIdentity } from "@/lib/wallet/wallet.server";
import type { WalletRole } from "@/lib/wallet/rules";
import { withWalletOwner } from "../_shared";

const Body = z.object({
  idType: z.enum(["bvn", "nin"]),
  idNumber: z.string().max(20),
  firstName: z.string().max(60),
  lastName: z.string().max(60),
  dateOfBirth: z.string().max(10),
  consent: z.boolean(),
});

// Step 1: check the owner's BVN or NIN (src/lib/wallet/wallet.server.ts verifyWalletIdentity).
export const POST = withWalletOwner(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Check the details and try again.", 400);
  const result = await verifyWalletIdentity({ id: user.id, role: user.role as WalletRole }, parsed.data);
  return result.ok ? ok(result) : apiError("NOT_VERIFIED", result.error, 422);
});
