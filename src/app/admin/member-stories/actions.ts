"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { reviewStory, saveVideoSample } from "@/lib/member-messaging/stories.server";

const PATH = "/admin/member-stories";

/** Approve a story for the tips, or decide not to use it (with a note the member sees). */
export async function decideStory(formData: FormData) {
  const admin = await requireAdminSection("leads");
  const decision = formData.get("decision") === "approved" ? "approved" : "rejected";
  const result = await reviewStory(admin.id, String(formData.get("storyId") ?? ""), decision, String(formData.get("note") ?? ""));
  revalidatePath(PATH);
  const back = String(formData.get("back") ?? PATH);
  redirect(`${back.startsWith(PATH) ? back : PATH}${back.includes("?") ? "&" : "?"}${result.ok ? `saved=${decision}` : `error=${encodeURIComponent(result.error)}`}`);
}

/** The sample Rex video for video tips when there's no member video to show (a Shopinbos demo, not a member's). */
export async function setVideoSample(formData: FormData) {
  const admin = await requireAdminSection("leads");
  const videoUrl = String(formData.get("videoUrl") ?? "").trim();
  const posterUrl = String(formData.get("posterUrl") ?? "").trim();
  const caption = String(formData.get("caption") ?? "").trim().slice(0, 120);
  const https = (value: string) => /^https:\/\/\S+$/.test(value);
  if (formData.get("clear") === "1") await saveVideoSample(null, admin.id);
  else if (!https(videoUrl) || !https(posterUrl)) redirect(`${PATH}?error=${encodeURIComponent("Add the video and cover picture as https links.")}#sample`);
  else await saveVideoSample({ videoUrl, posterUrl, caption }, admin.id);
  revalidatePath(PATH);
  redirect(`${PATH}?saved=sample#sample`);
}
