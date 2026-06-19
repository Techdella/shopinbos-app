import { NextRequest, NextResponse } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { submitVerification } from "@/app/actions/verification";
import type { AuthUser } from "@/lib/auth/types";

export const POST = withLogistics(async (_req: NextRequest, { user }: { user: AuthUser }) => {
  const result = await submitVerification("logistics_partner");
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
});
