import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/auth/middleware";
import { newsError, readNewsInput } from "@/lib/email/product-news.api";
import { sendProductNewsTest } from "@/lib/email/product-news.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/product-news/test — "[Test]" copy of the email as it is in the editor, to the admin's own inbox
export const POST = withAdmin(async (req: NextRequest, { user }) => {
  const input = await readNewsInput(req);
  if ("error" in input) return input.error;
  try {
    return NextResponse.json({ data: await sendProductNewsTest(input.data, user) });
  } catch (error) {
    return newsError(error);
  }
});
