import "server-only";

import { db } from "@/lib/db/client";
import { mergeBrandSettings, parseBrandSettings } from "@/lib/workspace";
import { INTEGRATION_VALIDATORS, type IntegrationKey } from "./integrations";

/**
 * Saves one connection found for the seller by a sign-in (the Google Analytics ID, the Search Console code, the
 * Meta pixel), so nobody pastes IDs. Validated like everything else; `onlyIfEmpty` never replaces one already set.
 */
export async function setStoreIntegration(storeId: string, key: IntegrationKey, value: string, options: { onlyIfEmpty?: boolean } = {}) {
  const clean = INTEGRATION_VALIDATORS[key](value);
  if (!clean) return false;
  const store = await db.store.findUnique({ where: { id: storeId }, select: { brandSettings: true } });
  if (!store) return false;
  const current = parseBrandSettings(store.brandSettings).integrations;
  const others = current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>) : {};
  if (options.onlyIfEmpty && INTEGRATION_VALIDATORS[key](others[key])) return false;
  await db.store.update({ where: { id: storeId }, data: { brandSettings: mergeBrandSettings(store.brandSettings, { integrations: { ...others, [key]: clean } }) } });
  return true;
}
