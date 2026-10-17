import "server-only";
import type { HostedGatewaysReady } from "@shared/checkout-payments";
import { opayReady } from "@/lib/opay";
import { korapayReady } from "@/lib/korapay";

/** Which hosted-checkout gateways have their keys on the server, for checkoutPaymentSettings. */
export function hostedGatewaysReady(): HostedGatewaysReady {
  return { opay: opayReady(), korapay: korapayReady() };
}
