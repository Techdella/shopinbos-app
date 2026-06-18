import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { searchDomainsOnVercel } from "@/lib/domains/vercel";

export const GET = withSeller(async (req: NextRequest) => {
  const q = new URL(req.url).searchParams.get("q");
  if (!q?.trim()) {
    return NextResponse.json({ error: { code: "missing_q", message: "Query param q is required" } }, { status: 400 });
  }

  const query = q.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!query) {
    return NextResponse.json({ error: { code: "invalid_q", message: "Use letters, numbers, or hyphens." } }, { status: 400 });
  }

  try {
    const domains = await searchDomainsOnVercel(query);
    return NextResponse.json({ data: domains });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "domain_search_failed",
          message: error instanceof Error ? error.message : "Domain search failed",
        },
      },
      { status: 400 },
    );
  }
});
