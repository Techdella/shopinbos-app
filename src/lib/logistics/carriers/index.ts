import "server-only";
import { kwik } from "./kwik";
import type { Carrier } from "./types";

// Delivery companies we book through their own API. A LogisticsPartner with `carrier` set to one of these ids
// stands for the company in the marketplace; ./jobs.server.ts books, cancels and syncs its jobs.

const CARRIERS: Record<string, Carrier> = { [kwik.id]: kwik };

/** The carrier behind a partner profile, or null for a partner who works jobs in the portal. */
export function carrierFor(partner: { carrier?: string | null } | null | undefined): Carrier | null {
  const id = partner?.carrier?.trim().toLowerCase();
  return id ? (CARRIERS[id] ?? null) : null;
}

export function listCarriers() {
  return Object.values(CARRIERS);
}

export type { Carrier, CarrierBooking, CarrierJobInput, CarrierParty, CarrierQuote, CarrierResult } from "./types";
