import { NextResponse } from "next/server";
import type { CacCheckResponse } from "./verify-cac.server";

export function cacCheckResponse(result: CacCheckResponse) {
  if (!result.ok) return NextResponse.json({ error: { code: result.code, message: result.message } }, { status: result.status });
  const { ok: _ok, ...data } = result;
  return NextResponse.json({ data });
}
