import "server-only";

import { Receiver } from "@upstash/qstash";
import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorization } from "@/lib/auth/cron";

// Who may run a scheduled job: a QStash schedule (signed with QSTASH_CURRENT/NEXT_SIGNING_KEY; see
// scripts/qstash-schedules.mjs) or anything sending `Authorization: Bearer $CRON_SECRET` (Supabase pg_cron, Vercel
// Cron, a manual run). Either is enough, so moving a job between schedulers needs no deploy.

let receiver: Receiver | null | undefined;
function qstashReceiver() {
  if (receiver === undefined) {
    const current = process.env.QSTASH_CURRENT_SIGNING_KEY;
    const next = process.env.QSTASH_NEXT_SIGNING_KEY;
    receiver = current && next ? new Receiver({ currentSigningKey: current, nextSigningKey: next }) : null;
  }
  return receiver;
}

/** null when the caller may run the job, otherwise the response to send back (401, or 503 if nothing is set up). */
export async function cronDenied(req: NextRequest): Promise<NextResponse | null> {
  const qstash = qstashReceiver();
  const signature = req.headers.get("upstash-signature");
  if (qstash && signature) {
    // The signature covers the URL QStash called and the body (empty for these GET schedules).
    const valid = await qstash
      .verify({ signature, body: await req.text(), url: req.url })
      .catch(() => false);
    if (valid) return null;
  }

  const secret = process.env.CRON_SECRET;
  if (!secret && !qstash) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "CRON_SECRET or the QStash signing keys must be set" } },
      { status: 503 },
    );
  }
  if (cronAuthorization(req.headers.get("authorization"), secret) !== "ok") {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, { status: 401 });
  }
  return null;
}
