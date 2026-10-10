import { NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";

export const GET = withSeller(async (_req, { user }) => {
  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { aiCredits: true },
  });
  return NextResponse.json({ credits: dbUser?.aiCredits ?? 0 });
});
