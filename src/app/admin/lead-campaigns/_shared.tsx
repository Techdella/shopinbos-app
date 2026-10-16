import { EmptyState } from "@/components/app-kit";
import { KIND_LABELS } from "@/lib/website-leads/pure";

// Server pieces shared by the /admin/lead-campaigns pages.

export const LEAD_KIND_OPTIONS = Object.entries(KIND_LABELS).map(([key, label]) => ({ key, label }));

export function GrowthNotReady() {
  return (
    <EmptyState icon="megaphone" title="Lead campaigns need a quick database update">
      Run docs/migrations/2026-11-05-lead-growth.sql on the Supabase database, then schedule /api/cron/lead-growth (the commented block at the bottom of that file) so scheduled campaigns and automation steps go out.
    </EmptyState>
  );
}

export function lagosTime(date: Date | null | undefined) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }).format(date);
}

/** A Date as a datetime-local value in Lagos time (UTC+1). */
export function lagosInputValue(date: Date) {
  return new Date(date.getTime() + 3_600_000).toISOString().slice(0, 16);
}
