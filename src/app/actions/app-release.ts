"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { AppReleaseSaveError, saveAppRelease } from "@/lib/app-release.server";
import { isAppReleasePlatform } from "@shared/app-release";

/** Admin › App updates: the latest and minimum build of the phone app (and an optional line), logged with a note. */
export async function saveAppReleaseAction(formData: FormData) {
  const user = await requireAdminSection("developers");
  const platform = String(formData.get("platform") ?? "android");
  if (!isAppReleasePlatform(platform)) redirect("/admin/app-release");
  const back = (params: Record<string, string>) => `/admin/app-release?${new URLSearchParams(params).toString()}`;
  let changed = false;
  try {
    const result = await saveAppRelease(
      platform,
      { latestBuild: formData.get("latestBuild") ?? undefined, minBuild: formData.get("minBuild") ?? undefined, message: formData.get("message") ?? undefined },
      { userId: user.id, note: String(formData.get("note") ?? "") },
    );
    changed = result.changed;
  } catch (error) {
    redirect(back({ error: error instanceof AppReleaseSaveError ? error.message : "That couldn't be saved. Try again." }));
  }
  revalidatePath("/admin/app-release");
  redirect(back({ saved: changed ? "Saved. Phones see it within a few minutes." : "Nothing changed." }));
}
