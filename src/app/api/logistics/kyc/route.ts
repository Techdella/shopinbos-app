import { stateResponse, withKycPartner } from "./_partner";

// The partner's verification: tier, checks, files, vehicles, guarantor, limits and graduation (src/lib/logistics/partner-kyc.server.ts).
export const GET = withKycPartner(async (_req, { partner }) => stateResponse(partner.id));
