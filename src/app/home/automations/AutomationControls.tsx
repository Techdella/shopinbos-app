"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toggle } from "@/components/app-ui";
import { buttonClass } from "@/components/growth/kit";
import { api, errorText } from "../marketing/_kit/client";
import { useT } from "@/components/i18n/I18nProvider";

/** On/off switch; switching on asks first because the flow will message customers by itself. */
export function FlowToggle({ id, name, active, messages }: { id: string; name: string; active: boolean; messages: number }) {
  const router = useRouter();
  const t = useT("automations");
  const [on, setOn] = useState(active);
  return (
    <Toggle
      on={on}
      label={t("toggle.label", { name })}
      onChange={async (next) => {
        if (next && !window.confirm(t("toggle.confirm", { name, what: messages ? t("toggle.upTo", { count: messages }) : t("toggle.messages") }))) return;
        setOn(next);
        try {
          await api(`/api/app/marketing/automations/${id}`, "PATCH", { active: next });
          router.refresh();
        } catch (error) {
          setOn(!next);
          window.alert(errorText(error));
        }
      }}
    />
  );
}

export function AddPresetButton({ presetKey, added }: { presetKey: string; added: boolean }) {
  const router = useRouter();
  const t = useT("automations", "common");
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className={buttonClass(added ? "white" : "ink", "sm")}
      onClick={async () => {
        setBusy(true);
        try {
          const flow = await api<{ id: string }>("/api/app/marketing/automations", "POST", { presetKey, active: false });
          router.push(`/home/automations/${flow.id}`);
        } catch (error) {
          window.alert(errorText(error));
          setBusy(false);
        }
      }}
    >
      {busy ? t("add.adding") : added ? t("add.another") : t("add")}
    </button>
  );
}
