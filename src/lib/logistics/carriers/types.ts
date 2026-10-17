import type { JobStatus } from "../job-rules";

// What every delivery company we book through its own API does (lib/logistics/carriers): price a job live, book
// it, cancel it and say where it is. One file per carrier (./kwik.ts); ./index.ts picks one by name.

export interface CarrierParty {
  name: string;
  phone: string;
  email?: string | null;
  address: string;
}

export interface CarrierJobInput {
  pickup: CarrierParty;
  dropoff: CarrierParty;
  /** For the vehicle: no weight means a bike. */
  weightKg?: number | null;
  /** Pay on delivery: what the rider collects from the buyer. */
  codAmount?: number | null;
  /** What the parcel is worth (the order total), for carriers that insure or declare it. */
  parcelValue?: number | null;
  notes?: string | null;
  /** When the rider should collect it; now (plus a few minutes) when missing or past. */
  pickupAt?: Date | null;
}

export type CarrierResult<T> = { ok: true; value: T } | { ok: false; code: CarrierErrorCode; error: string };

/** NOT_CONFIGURED: no credentials; BAD_ADDRESS: an address we couldn't place; PRICE_CHANGED: dearer than agreed. */
export type CarrierErrorCode = "NOT_CONFIGURED" | "BAD_ADDRESS" | "PRICE_CHANGED" | "REJECTED" | "UNAVAILABLE";

export interface CarrierQuote {
  price: number;
  currency: string;
}

/** One courier from an aggregator network (Shipbubble): shown to sellers as its own line. */
export interface CarrierOption extends CarrierQuote {
  /** What booking sends back to pick this courier. */
  id: string;
  /** The courier's own name ("GIG logistics"): it set the price. */
  name: string;
  eta: string | null;
}

export interface CarrierBooking extends CarrierQuote {
  /** The carrier's order reference (Kwik: unique_order_id). */
  ref: string;
  jobIds: Array<string | number>;
  trackingUrl: string | null;
}

export interface CarrierTracking {
  status: JobStatus | null;
  /** The carrier's own status, kept for support. */
  raw: string;
}

/**
 * A seller's own login or keys for a network (fields from Carrier.credentialFields). Every call takes them
 * optionally: without them it uses Shopinbos's own account from the environment.
 */
export type CarrierCredentials = Record<string, string>;

export interface CarrierCredentialField {
  key: string;
  label: string;
  secret?: boolean;
}

export interface Carrier {
  id: string;
  name: string;
  /** What a seller types to connect their own account. */
  credentialFields: CarrierCredentialField[];
  /** Shopinbos's own account is set up (its keys are in the environment). */
  configured(): boolean;
  /** Checks a seller's credentials work; the label is what they recognise the account by. */
  verify(credentials: CarrierCredentials): Promise<CarrierResult<{ label: string }>>;
  quote(input: CarrierJobInput, credentials?: CarrierCredentials | null): Promise<CarrierResult<CarrierQuote>>;
  /** Aggregators only: every courier's price for the job (cheapest first). quote() is then the cheapest. */
  options?(input: CarrierJobInput, credentials?: CarrierCredentials | null): Promise<CarrierResult<CarrierOption[]>>;
  /**
   * Prices and books the job; refuses (PRICE_CHANGED) when the live price is above maxPrice. optionId picks an
   * aggregator's courier (CarrierOption.id).
   */
  book(input: CarrierJobInput, options?: { maxPrice?: number | null; credentials?: CarrierCredentials | null; optionId?: string | null }): Promise<CarrierResult<CarrierBooking>>;
  cancel(booking: { ref: string; jobIds: Array<string | number> }, credentials?: CarrierCredentials | null): Promise<CarrierResult<null>>;
  track(booking: { ref: string; jobIds: Array<string | number> }, credentials?: CarrierCredentials | null): Promise<CarrierResult<CarrierTracking>>;
  /**
   * The booking reference a webhook from the carrier is about (its externalRef), or null. The webhook only makes us
   * read the job's status from the carrier again, so its body is never trusted for the status itself.
   */
  webhookRef?(payload: unknown): string | null;
}
