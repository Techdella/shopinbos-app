import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { assignDomainOnVercel, hasVercelDomainConfig } from "@/lib/domains/vercel";
import { normalizeDomain } from "@/lib/domains/storefront";

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => null)) as { domain?: string } | null;
  const normalizedDomain = normalizeDomain(body?.domain ?? "");

  if (!normalizedDomain) {
    return NextResponse.json(
      { error: { code: "missing_domain", message: "Domain is required." } },
      { status: 400 },
    );
  }

  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) {
    return NextResponse.json(
      { error: { code: "store_not_found", message: "Create your store before adding a custom domain." } },
      { status: 404 },
    );
  }

  if (!hasVercelDomainConfig()) {
    return NextResponse.json(
      {
        error: {
          code: "vercel_not_configured",
          message: "Set VERCEL_TOKEN and VERCEL_PROJECT_ID_OR_NAME before connecting custom domains.",
        },
      },
      { status: 503 },
    );
  }

  try {
    const assigned = await assignDomainOnVercel(normalizedDomain);

    await db.store.update({
      where: { id: store.id },
      data: { customDomain: assigned.domain },
    });

    return NextResponse.json({ data: assigned });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "We could not add that domain to your Vercel project.";

    return NextResponse.json(
      { error: { code: "vercel_domain_failed", message } },
      { status: 400 },
    );
  }
});
