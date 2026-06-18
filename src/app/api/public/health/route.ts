import { NextRequest } from "next/server";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok } from "@/lib/api/response";

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(req: NextRequest) {
  return withCors(
    req,
    ok({
      status: "ok",
      service: "shopinbos-public-api",
      version: "v1",
      readOnly: true,
      timestamp: new Date().toISOString(),
    }),
    { cacheControl: "no-store" },
  );
}
