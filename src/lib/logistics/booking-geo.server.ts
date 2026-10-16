import "server-only";
import { db } from "@/lib/db/client";
import { addressPoint, isLatLng, type LatLng } from "@shared/delivery-geo";
import { findNgPostcode, parseNgPostcode } from "@shared/ng-postcode";
import { geocodeAddress } from "./geocode";

// Where a delivery job starts and ends, saved on the booking when it's created so riders and partner systems get
// the exact points (DeliveryBooking.pickup* / dropoff*). In order, for each end:
//   1. a pin we already have: the buyer's from checkout (the order's deliveryAddress), or the supplier's saved one;
//   2. the drop-off address geocoded (NIPOST postcode in it first, then Google / Nominatim; cached), within a short
//      budget so booking never waits on a slow geocoder. Area-centre guesses are not saved as a drop-off pin.
// The pickup without a pin is left to ensurePickupCoords (geocode.ts), which already runs when partners open jobs.
// Postcodes are the one given, or one written in the address. Never throws.

const GEOCODE_BUDGET_MS = 3500;

export interface BookingEnd {
  address: string;
  point?: LatLng | null;
  postcode?: string | null;
}

export interface BookingGeoFields {
  pickupLat?: number;
  pickupLng?: number;
  pickupGeoSource?: string;
  pickupGeocodedAt?: Date;
  pickupPostcode: string | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  dropoffPostcode: string | null;
  dropoffGeoSource: string | null;
}

function postcodeFor(end: BookingEnd) {
  return parseNgPostcode(end.postcode)?.canonical ?? findNgPostcode(end.address)?.canonical ?? null;
}

async function withinBudget<T>(work: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), GEOCODE_BUDGET_MS);
  });
  try {
    return await Promise.race([work.catch(() => null), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** The buyer's pin and postcode from a store order's saved delivery address. */
export function orderDropoff(deliveryAddress: unknown): { point: LatLng | null; postcode: string | null } {
  const postalCode = deliveryAddress && typeof deliveryAddress === "object" ? (deliveryAddress as { postalCode?: unknown }).postalCode : null;
  return { point: addressPoint(deliveryAddress), postcode: typeof postalCode === "string" ? parseNgPostcode(postalCode)?.canonical ?? null : null };
}

/** The pickup / drop-off fields to save on a new booking. `orderId` reads the buyer's pin from their order. */
export async function bookingGeoFields(input: { pickup: BookingEnd; dropoff: BookingEnd; orderId?: string | null; country?: string | null }): Promise<BookingGeoFields> {
  const dropoff = { ...input.dropoff };
  if (input.orderId && !dropoff.point) {
    const order = await db.retailOrder.findUnique({ where: { id: input.orderId }, select: { deliveryAddress: true } }).catch(() => null);
    if (order) {
      const fromOrder = orderDropoff(order.deliveryAddress);
      dropoff.point = fromOrder.point;
      dropoff.postcode ??= fromOrder.postcode;
    }
  }

  const fields: BookingGeoFields = {
    pickupPostcode: postcodeFor(input.pickup),
    dropoffLat: null,
    dropoffLng: null,
    dropoffPostcode: postcodeFor(dropoff),
    dropoffGeoSource: null,
  };
  if (input.pickup.point && isLatLng(input.pickup.point)) {
    fields.pickupLat = input.pickup.point.lat;
    fields.pickupLng = input.pickup.point.lng;
    fields.pickupGeoSource = "pin";
    fields.pickupGeocodedAt = new Date();
  }

  if (dropoff.point && isLatLng(dropoff.point)) {
    fields.dropoffLat = dropoff.point.lat;
    fields.dropoffLng = dropoff.point.lng;
    fields.dropoffGeoSource = "pin";
  } else if (dropoff.address.trim().length >= 5) {
    const found = await withinBudget(geocodeAddress(dropoff.address, input.country));
    if (found && found.source !== "area") {
      fields.dropoffLat = found.lat;
      fields.dropoffLng = found.lng;
      fields.dropoffGeoSource = found.source;
    }
  }
  return fields;
}

/** The drop-off pin saved on a booking, or null. */
export function bookingDropoffPoint(job: { dropoffLat?: number | null; dropoffLng?: number | null }): LatLng | null {
  const point = { lat: job.dropoffLat ?? NaN, lng: job.dropoffLng ?? NaN };
  return isLatLng(point) ? point : null;
}
