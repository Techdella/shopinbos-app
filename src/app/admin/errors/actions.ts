"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { setErrorFixed } from "@/lib/errors/service.server";

/** Mark a problem fixed (every account that hit it), or open it again. It re-opens itself if it happens again. */
export async function markErrorFixed(formData: FormData) {
  await requireAdminSection("developers");
  const fingerprint = String(formData.get("fingerprint") ?? "");
  const fixed = formData.get("fixed") === "1";
  const back = String(formData.get("back") ?? "/admin/errors");
  if (fingerprint) await setErrorFixed(fingerprint, fixed);
  revalidatePath("/admin/errors");
  redirect(back.startsWith("/admin/errors") ? back : "/admin/errors");
}
