import { NextRequest, NextResponse } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { submitVerification } from "@/app/actions/verification";
import type { AuthUser } from "@/lib/auth/types";

export const POST = withSupplier(async (_req: NextRequest, { user }: { user: AuthUser }) => {
  const result = await submitVerification("supplier");
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
});
