"use client";

import { useState, type FormEvent } from "react";
import { addSupplierShowcaseMember } from "@/app/actions/supplier";
import { Spinner } from "@/components/app-ui";
import { useT } from "@/components/i18n/I18nProvider";
import { buttonClass, fieldClass, labelClass } from "@/components/supplier/supplier-kit";

// "Meet the team" on Supplier › Profile: a name, what they do and a photo. The photo is made small in the browser
// first (server actions take 1 MB at most; a phone photo is several). The action redirects back with ?saved or ?error.

const SIDE = 640;

async function shrink(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

export function ShowcaseMemberForm() {
  const t = useT("supplier");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const photo = form.get("photo");
    setBusy(true);
    try {
      if (photo instanceof File && photo.size) form.set("photo", await shrink(photo), "photo.jpg");
      await addSupplierShowcaseMember(form);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3 border-t border-app-line pt-4 sm:grid-cols-2">
      <div>
        <label htmlFor="team-name" className={labelClass}>{t("profile.teamName")}</label>
        <input id="team-name" className={fieldClass} name="name" required minLength={2} maxLength={80} />
      </div>
      <div>
        <label htmlFor="team-role" className={labelClass}>{t("profile.teamRole")}</label>
        <input id="team-role" className={fieldClass} name="role" maxLength={60} placeholder={t("profile.teamRolePlaceholder")} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="team-photo" className={labelClass}>{t("profile.teamPhoto")}</label>
        <input id="team-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required className="block w-full text-[14px]" />
      </div>
      <div className="sm:col-span-2">
        <button type="submit" disabled={busy} className={buttonClass.ink}>{busy && <Spinner />} {t("profile.teamAdd")}</button>
      </div>
    </form>
  );
}
