import type { Metadata } from "next";
import { adminFrame } from "@/components/admin/AdminKit";
import { AppReleaseAdmin } from "@/components/admin/AppReleaseAdmin";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { appReleaseHistory, getAppRelease } from "@/lib/app-release.server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "App updates" };

// Admin › App updates (shared/app-release.ts): tells phones on an older Android build that a new version is on
// Google Play, and makes builds that are too old to work update first. Stored in PlatformSetting
// "app.release.android"; every change is logged in PlatformSettingChange. The phone app asks
// /api/mobile/app-release on launch and when it comes back to the front.

export default async function AdminAppReleasePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireAdminSection("developers");
  const [query, release, history] = await Promise.all([searchParams, getAppRelease("android"), appReleaseHistory().catch(() => [])]);
  return <AppReleaseAdmin frame={adminFrame(user)} query={query} release={release} history={history} />;
}
