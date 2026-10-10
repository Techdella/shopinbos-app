import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { getDomainContactSchemaOnVercel } from "@/lib/domains/vercel";
import { normalizeDomain } from "@/lib/domains/storefront";

export const GET = withSeller(async (req: NextRequest) => {
  const rawDomain = new URL(req.url).searchParams.get("domain") ?? "";
  const domain = normalizeDomain(rawDomain);

  if (!domain) {
    return NextResponse.json(
      { error: { code: "missing_domain", message: "Domain is required." } },
      { status: 400 },
    );
  }

  try {
    const schema = await getDomainContactSchemaOnVercel(domain);
    return NextResponse.json({ data: schema });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "contact_schema_failed",
          message: error instanceof Error ? error.message : "Could not load contact requirements.",
        },
      },
      { status: 400 },
    );
  }
});
