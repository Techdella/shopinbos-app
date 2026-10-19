import "server-only";
import { db } from "@/lib/db/client";
import { identityChecksReady } from "./wallet.server";

/** Whether this person's ID passed the Shopinbos Wallet check, for onboarding, the top bar and Start here. */
export async function idCheckState(userId: string) {
  const wallet = await db.wallet.findUnique({ where: { userId }, select: { kycStatus: true, kycFirstName: true, kycLastName: true } });
  const verified = wallet?.kycStatus === "verified";
  return { verified, checksReady: identityChecksReady(), name: verified ? [wallet?.kycFirstName, wallet?.kycLastName].filter(Boolean).join(" ") : null };
}
