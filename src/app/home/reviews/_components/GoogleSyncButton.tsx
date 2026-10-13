"use client";

import { useActionState } from "react";
import { syncGoogleAction, type ActionState } from "@/app/actions/reviews";
import { Notice, PillButton } from "@/components/app-ui";
import { useT } from "@/components/i18n/I18nProvider";

export function GoogleSyncButton() {
  const t = useT("reviews");
  const [state, action, pending] = useActionState<ActionState, FormData>(syncGoogleAction, null);
  return (
    <form action={action} className="grid gap-2">
      <PillButton type="submit" size="md" tone="ink" busy={pending} className="w-fit">{t("google.importNow")}</PillButton>
      {state ? <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice> : null}
    </form>
  );
}
