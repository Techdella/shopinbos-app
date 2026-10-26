import "server-only";
import { db } from "@/lib/db/client";
import { paystackKeyProblems } from "@shared/paystack-return";
import { jobStatus, settingStatus, type CronRow } from "./pure";

// Admin › Developers › Launch settings: keys this deployment has (set or not) and the Supabase pg_cron jobs with
// their last run. pg_cron and pg_net are read with plain SQL; when the database user can't read them (or they
// aren't installed) the card says so instead of failing the page.

export interface CronHttpSummary {
  /** Responses pg_net got back in the last two hours, by HTTP status. */
  byStatus: Array<{ status: number | null; count: number }>;
  refused: number;
}

async function cronRows(): Promise<CronRow[] | null> {
  try {
    const rows = await db.$queryRaw<Array<{ jobname: string; active: boolean; schedule: string; last_run: Date | null; last_status: string | null }>>`
      SELECT j.jobname, j.active, j.schedule, d.start_time AS last_run, d.status AS last_status
      FROM cron.job j
      LEFT JOIN LATERAL (
        SELECT start_time, status FROM cron.job_run_details r WHERE r.jobid = j.jobid ORDER BY start_time DESC LIMIT 1
      ) d ON true`;
    return rows.map((r) => ({ jobname: r.jobname, active: r.active, schedule: r.schedule, lastRun: r.last_run, lastStatus: r.last_status, lastHttp: null }));
  } catch (error) {
    console.warn("[launch-check] couldn't read pg_cron", error instanceof Error ? error.message : error);
    return null;
  }
}

async function httpSummary(): Promise<CronHttpSummary | null> {
  try {
    const rows = await db.$queryRaw<Array<{ status: number | null; count: bigint }>>`
      SELECT status_code AS status, count(*) AS count FROM net._http_response
      WHERE created > now() - interval '2 hours' GROUP BY status_code ORDER BY count(*) DESC`;
    const byStatus = rows.map((r) => ({ status: r.status, count: Number(r.count) }));
    return { byStatus, refused: byStatus.filter((r) => r.status === 401 || r.status === 403).reduce((n, r) => n + r.count, 0) };
  } catch {
    return null;
  }
}

export async function launchCheck() {
  const [rows, http] = await Promise.all([cronRows(), httpSummary()]);
  return {
    settings: settingStatus(process.env),
    // Keys from different modes, test keys on the live site, Paystack's test DVA bank with live keys.
    paystack: paystackKeyProblems(process.env, process.env.VERCEL_ENV === "production"),
    jobs: rows ? jobStatus(rows) : null,
    http,
    qstash: Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY),
  };
}
