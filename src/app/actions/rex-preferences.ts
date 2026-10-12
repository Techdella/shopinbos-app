"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { getCurrentAppUser } from "@/lib/server-auth";
import { mergeBrandSettings } from "@/lib/workspace";
import { rexPreferencesFromForm } from "@shared/rex-preferences";

const TAB = "/home/settings?tab=Peggy+%26+Rex";

/** Settings > Peggy & Rex > "Rex — your store designer". Saved like Peggy's settings, in Store.brandSettings. */
export async function saveRexPreferences(formData: FormData) {
  const user = await getCurrentAppUser({ redirectTo: "/login" });
  if (!user || user.role !== "seller") redirect("/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, brandSettings: true } });
  if (!store) redirect(`${TAB}&error=Store+not+found`);

  const parsed = rexPreferencesFromForm(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${TAB}&error=${encodeURIComponent("Some of Rex's settings weren't valid. Check them and save again.")}`);

  await db.store.update({
    where: { id: store.id },
    data: { brandSettings: mergeBrandSettings(store.brandSettings, { rexPreferences: parsed.data }) },
  });
  redirect(`${TAB}&saved=true`);
}
