import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { DomainError, verifyPendingDomain } from "@/lib/domains/ownership.server";

// Checks _shopinbos-verify.<pending domain> for the store's token. A record that isn't there (yet) is a normal
// answer (200, data.check.ok false with the reason); refusals (taken, rate limited, nothing pending) are errors.
export const POST = withSeller(async (_req: NextRequest, { user }) => {
  try {
    return NextResponse.json({ data: await verifyPendingDomain(user.id) });
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    console.error("[domains] verify failed", error);
    return NextResponse.json({ error: { code: "verify_failed", message: "We couldn't check your domain just now. Try again." } }, { status: 500 });
  }
});
