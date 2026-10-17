import "server-only";
import type { HostedGatewaysReady } from "@shared/checkout-payments";
import { korapayReady } from "@/lib/korapay";

/** Which embedded-checkout gateways besides Paystack have their keys on the server, for checkoutPaymentSettings. */
export function hostedGatewaysReady(): HostedGatewaysReady {
  return { korapay: korapayReady() };
}
