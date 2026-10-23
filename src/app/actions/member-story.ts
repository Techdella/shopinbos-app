"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/server-auth";
import { deleteStory, saveStory, withdrawStory } from "@/lib/member-messaging/stories.server";
import { memberLocale } from "@/lib/member-messaging/i18n";
import { db } from "@/lib/db/client";
import { STORY_PAGE } from "@/components/member-stories/paths";

// Share your story (sellers, suppliers, delivery partners): save with consent, withdraw, delete.

async function member() {
  const user = await getCurrentAppUser();
  if (!user || !(user.role in STORY_PAGE)) redirect("/login");
  return { ...user, page: STORY_PAGE[user.role as keyof typeof STORY_PAGE] };
}

export async function submitStory(formData: FormData) {
  const user = await member();
  const prefs = await db.user.findUnique({ where: { id: user.id }, select: { preferences: true } });
  const result = await saveStory(user, {
    displayName: String(formData.get("displayName") ?? ""),
    city: String(formData.get("city") ?? ""),
    result: String(formData.get("result") ?? ""),
    story: String(formData.get("story") ?? ""),
    consent: formData.get("consent") === "yes",
    videoProjectId: String(formData.get("videoProjectId") ?? "") || null,
    language: memberLocale(prefs?.preferences),
  });
  revalidatePath(user.page);
  redirect(result.ok ? `${user.page}?saved=1` : `${user.page}?error=${encodeURIComponent(result.error)}`);
}

export async function withdrawMyStory() {
  const user = await member();
  await withdrawStory(user.id);
  revalidatePath(user.page);
  redirect(`${user.page}?withdrawn=1`);
}

export async function deleteMyStory() {
  const user = await member();
  await deleteStory(user.id);
  revalidatePath(user.page);
  redirect(`${user.page}?deleted=1`);
}
