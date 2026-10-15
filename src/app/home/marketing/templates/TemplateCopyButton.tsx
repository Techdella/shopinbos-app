"use client";

import { alertDialog } from "@/components/ui/dialogs";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/growth/kit";
import { api, errorText } from "../_kit/client";
import { useT } from "@/components/i18n/I18nProvider";

export function TemplateCopyButton({ templateKey }: { templateKey: string }) {
  const router = useRouter();
  const t = useT("emailBuilder");
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className={buttonClass("white", "sm")}
      onClick={async () => {
        setBusy(true);
        try {
          const copy = await api<{ id: string }>("/api/app/marketing/templates", "POST", { copy: templateKey });
          router.push(`/home/marketing/templates/${copy.id}`);
        } catch (error) {
          await alertDialog(errorText(error));
          setBusy(false);
        }
      }}
    >
      {busy ? t("tpl.copying") : t("tpl.copyEdit")}
    </button>
  );
}
