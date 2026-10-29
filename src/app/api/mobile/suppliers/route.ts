import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { supplierDirectory } from "@/lib/suppliers/directory.server";

export const dynamic = "force-dynamic";

// GET ?q=&category= → { hasPlace, suppliers }: every supplier a seller can browse in the phone app (the web's
// /marketplace/suppliers), near or far, nearest first: src/lib/suppliers/directory.server.ts.
export const GET = withSeller(async (req: NextRequest, { user }) => {
  const params = req.nextUrl.searchParams;
  return ok(await supplierDirectory(user.id, { q: params.get("q") ?? "", category: params.get("category") ?? "" }));
});
