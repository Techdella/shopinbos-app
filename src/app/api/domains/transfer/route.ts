import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { transferLock } from "@/lib/domains/billing-pure";
import { markDomainMoving } from "@/lib/domains/billing.server";
import { normalizeDomain } from "@/lib/domains/storefront";
import { VercelApiError, getDomainAuthCodeOnVercel } from "@/lib/domains/vercel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Move my domain to another company": the transfer code (EPP auth code) for a domain this store bought through us,
// from Vercel's registrar (GET /v1/registrar/domains/{domain}/auth-code). Registrars lock a domain for 60 days after
// it is bought; then we answer { locked, availableAt } instead. Any other failure: the screen offers a help request.
const Body = z.object({ domain: z.string().trim().min(3).max(260) });

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "missing_domain", message: "Say which domain to move." } }, { status: 400 });
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return NextResponse.json({ error: { code: "store_not_found", message: "Create your store first." } }, { status: 404 });

  const domain = normalizeDomain(parsed.data.domain);
  const rows = await db.domainPurchase.findMany({
    where: { storeId: store.id, domain, status: "bought" },
    orderBy: { createdAt: "asc" },
    select: { kind: true, paidAt: true, createdAt: true },
  });
  if (!rows.length) {
    return NextResponse.json({ error: { code: "not_found", message: "We can only move domains you bought through Shopinbos." } }, { status: 404 });
  }
  const first = rows.find((row) => row.kind === "new") ?? rows[0]!;
  const lock = transferLock(first.paidAt ?? first.createdAt, new Date());
  if (lock.locked) {
    return NextResponse.json({ data: { domain, locked: true, availableAt: lock.availableAt.toISOString(), authCode: null } });
  }

  try {
    const { authCode } = await getDomainAuthCodeOnVercel(domain);
    await markDomainMoving(store.id, domain);
    return NextResponse.json({ data: { domain, locked: false, availableAt: null, authCode } });
  } catch (error) {
    if (error instanceof VercelApiError && error.status === 409) {
      return NextResponse.json({ data: { domain, locked: true, availableAt: null, authCode: null } });
    }
    console.error("[domains] auth code failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: { code: "auth_code_failed", message: "We couldn't get the transfer code right now." } }, { status: 502 });
  }
});
