"use client";

import { useTransition } from "react";
import { AssistantNote } from "@/components/app-kit";
import { useT } from "@/components/i18n/I18nProvider";
import { leaveTeamAction } from "@/app/actions/staff";

// Shown to a staff member in Settings: whose store they're working in, and a way to leave the team.
export function StaffNote({ ownerName, storeName }: { ownerName: string; storeName: string }) {
  const t = useT("account");
  const [pending, start] = useTransition();
  return (
    <AssistantNote
      who="peggy"
      action={
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => { await leaveTeamAction(); window.location.href = "/home"; })}
          className="min-h-[40px] rounded-full bg-app-ink px-4 text-[13px] font-bold text-white disabled:opacity-55"
        >
          {t("team.leave")}
        </button>
      }
    >
      {t("team.staffNote", { owner: ownerName, store: storeName })}
    </AssistantNote>
  );
}
