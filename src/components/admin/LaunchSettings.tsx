import { Card, CardHead, ListCard, ListRow, Pill } from "@/components/app-kit";
import type { CronHttpSummary } from "@/lib/launch-check/server";
import type { JobStatus, SettingStatus } from "@/lib/launch-check/pure";

// Admin › Developers › Launch settings (src/lib/launch-check). Only whether each key is set, never its value.

const JOB_PILL = {
  running: { tone: "success", word: "Running" },
  failing: { tone: "danger", word: "Failing" },
  paused: { tone: "warning", word: "Paused" },
  missing: { tone: "danger", word: "Not scheduled" },
  vercel: { tone: "muted", word: "Vercel Cron" },
} as const;

const when = (date: Date | null) => (date ? date.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }) : null);

export function LaunchSettings({ settings, paystack = [], jobs, http, qstash }: { settings: SettingStatus[]; paystack?: string[]; jobs: JobStatus[] | null; http: CronHttpSummary | null; qstash: boolean }) {
  const groups = [...new Set(settings.map((s) => s.group))];
  const missingRequired = settings.filter((s) => s.level === "required" && !s.set).length;
  const missingRecommended = settings.filter((s) => s.level === "recommended" && !s.set).length;
  const badJobs = jobs?.filter((j) => j.health === "missing" || j.health === "failing" || j.health === "paused").length ?? 0;

  return (
    <>
      <Card className="mb-4 p-5">
        <CardHead
          title="Keys in this deployment"
          sub="Add missing keys in Vercel → Settings → Environment Variables (Production), then redeploy. Values are never shown here."
          action={missingRequired ? <Pill tone="danger" dot>{missingRequired} required missing</Pill> : <Pill tone="success" dot>Required keys set</Pill>}
        />
        {missingRecommended ? <p className="m-0 mt-2 text-[13px] text-app-ink-soft">{missingRecommended} recommended {missingRecommended === 1 ? "key falls" : "keys fall"} back to a shared secret. It works, but give each its own value before launch.</p> : null}
        {paystack.map((problem) => (
          <p key={problem} className="m-0 mt-2 text-[13px] font-semibold text-app-danger">{problem}</p>
        ))}
      </Card>
      {groups.map((group) => (
        <div key={group} className="mb-4">
          <h3 className="mb-2 mt-0 font-mono text-[11px] uppercase tracking-[0.16em] text-app-ink-soft">{group}</h3>
          <ListCard>
            {settings.filter((s) => s.group === group).map((s) => (
              <ListRow key={s.keys.join("|")}>
                <div className="min-w-0 flex-1 basis-[260px]">
                  <div className="text-[15px] font-extrabold">{s.label}</div>
                  <code className="font-mono text-[12px] text-app-ink-soft">{s.setKey ?? s.keys.join(" or ")}</code>
                  {!s.set ? <div className="mt-1 text-[13px] text-app-ink-soft">{s.missing} <span className="font-semibold">Get it:</span> {s.where}</div> : null}
                </div>
                {s.set ? <Pill tone="success" dot>Set</Pill> : <Pill tone={s.level === "required" ? "danger" : "warning"} dot>{s.level === "required" ? "Missing" : "Not set"}</Pill>}
              </ListRow>
            ))}
          </ListCard>
        </div>
      ))}

      <Card className="mb-4 mt-6 p-5">
        <CardHead
          title="Scheduled jobs"
          sub={qstash ? "QStash signing keys are set: jobs moved to QStash won't show in pg_cron. Check console.upstash.com → QStash → Schedules for those." : "Run by Supabase pg_cron (Database → Cron), calling the app with the cron_secret from Supabase Vault."}
          action={jobs ? (badJobs ? <Pill tone="danger" dot>{badJobs} need attention</Pill> : <Pill tone="success" dot>All running</Pill>) : <Pill tone="muted" dot>Couldn&apos;t read</Pill>}
        />
        {http?.refused ? (
          <p className="m-0 mt-2 text-[13px] font-semibold text-app-danger">
            {http.refused} scheduled call{http.refused === 1 ? " was" : "s were"} refused in the last two hours: CRON_SECRET in Vercel doesn&apos;t match cron_secret in Supabase Vault.
          </p>
        ) : http ? (
          <p className="m-0 mt-2 text-[13px] text-app-ink-soft">Last two hours: {http.byStatus.map((s) => `${s.count} × HTTP ${s.status ?? "no answer"}`).join(", ") || "no calls"}.</p>
        ) : null}
        {!jobs ? <p className="m-0 mt-2 text-[13px] text-app-ink-soft">This database user can&apos;t read cron.job. Check Supabase → Database → Cron instead.</p> : null}
      </Card>
      {jobs ? (
        <ListCard>
          {jobs.map((job) => (
            <ListRow key={job.path}>
              <div className="min-w-0 flex-1 basis-[260px]">
                <div className="text-[15px] font-extrabold">{job.label}</div>
                <code className="font-mono text-[12px] text-app-ink-soft">{job.path}{job.schedule ? ` · ${job.schedule}` : ""}</code>
                <div className="mt-1 text-[13px] text-app-ink-soft">{job.detail}{job.lastRun ? ` ${when(job.lastRun)}.` : ""}</div>
              </div>
              <Pill tone={JOB_PILL[job.health].tone} dot>{JOB_PILL[job.health].word}</Pill>
            </ListRow>
          ))}
        </ListCard>
      ) : null}
    </>
  );
}
