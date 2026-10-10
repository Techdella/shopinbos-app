import { getDb } from '@shopinbos/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** GET /api/health — db and redis reachability (paystack ping arrives in phase 2). */
export async function GET() {
  const checks: Record<string, 'ok' | 'down' | 'not_configured'> = {};

  try {
    if (!process.env.DATABASE_URL) checks.db = 'not_configured';
    else {
      await getDb().$queryRaw`select 1`;
      checks.db = 'ok';
    }
  } catch {
    checks.db = 'down';
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  if (!redisUrl) checks.redis = 'not_configured';
  else {
    try {
      const res = await fetch(`${redisUrl}/ping`, {
        headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
      });
      checks.redis = res.ok ? 'ok' : 'down';
    } catch {
      checks.redis = 'down';
    }
  }

  const healthy = !Object.values(checks).includes('down');
  return NextResponse.json(
    { data: { status: healthy ? 'ok' : 'degraded', checks } },
    { status: healthy ? 200 : 503 },
  );
}
