import "server-only";
import { db } from "@/lib/db/client";
import { decryptJson, encryptJson, hasCredentialKey } from "@/lib/inbox/crypto";
import type { CarrierCredentials } from "./types";

// Sellers' own delivery network accounts (DeliveryNetworkAccount): their login or keys, encrypted at rest with
// INBOX_ENCRYPTION_KEY, decrypted only to call the network.

export function canStoreNetworkAccounts() {
  return hasCredentialKey();
}

export function sealCredentials(credentials: CarrierCredentials) {
  return encryptJson(credentials);
}

/** A connected account's credentials, or null when it's gone or can't be read (key changed). */
export async function networkCredentials(accountId: string | null | undefined): Promise<CarrierCredentials | null> {
  if (!accountId) return null;
  const account = await db.deliveryNetworkAccount.findUnique({ where: { id: accountId }, select: { credentials: true } });
  return account ? decryptJson<CarrierCredentials>(account.credentials) : null;
}
