import { ninStep } from "@/lib/logistics/kyc-steps.server";
import { readJson, withKycPartner } from "../_partner";

export const runtime = "nodejs";

// The step itself is in src/lib/logistics/kyc-steps.server.ts, shared with the phone link (/verify/phone/[token]).
export const POST = withKycPartner(async (req, { partner }) => ninStep(partner, await readJson(req)));
