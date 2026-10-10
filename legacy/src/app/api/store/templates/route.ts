import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { listTemplatesResponse } from "@/lib/store-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withSeller(async (_req: NextRequest) => {
  return NextResponse.json({ data: listTemplatesResponse() });
});
