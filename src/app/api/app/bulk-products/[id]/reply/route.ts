// "Add many with Peggy" (src/lib/products/bulk/routes.server.ts has the handlers; the phone and the web share them).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export { replyHandler as POST } from "@/lib/products/bulk/routes.server";
