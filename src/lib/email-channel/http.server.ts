import "server-only";

import { apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { EmailSetupError } from "./server";

/** The signed-in seller's store, with what the email setup needs (every email route starts here: ownership). */
export async function sellerEmailStore(userId: string) {
  return db.store.findUnique({ where: { userId }, select: { id: true, name: true, slug: true, customDomain: true } });
}

/** A setup refusal as the API's error shape (the code lets the page say it in the seller's language). */
export function emailSetupFailure(error: unknown) {
  if (error instanceof EmailSetupError) return apiError(error.code, error.message, error.status);
  throw error;
}
