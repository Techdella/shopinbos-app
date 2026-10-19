"use client";

import { SMS_ENABLED } from "@/lib/features";
import { useActionState, useState } from "react";
import { saveReviewSettings, type ActionState } from "@/app/actions/reviews";
import { Notice, PillButton, Toggle } from "@/components/app-ui";
import { field } from "@/components/seller-core";
import { useT } from "@/components/i18n/I18nProvider";

export function SettingsForm({ initial, ready }: { initial: { autoRequest: boolean; requestDelayDays: number; requestChannel: string; autoApprove: boolean }; ready: Record<string, boolean> }) {
  const t = useT("reviews");
  const [state, action, pending] = useActionState<ActionState, FormData>(saveReviewSettings, null);
  const [autoRequest, setAutoRequest] = useState(initial.autoRequest);
  const [autoApprove, setAutoApprove] = useState(initial.autoApprove);
  const [channel, setChannel] = useState(initial.requestChannel);
  return (
    <form action={action} className="grid gap-4">
      {autoRequest ? <input type="hidden" name="autoRequest" value="on" /> : null}
      {autoApprove ? <input type="hidden" name="autoApprove" value="on" /> : null}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[15px] font-bold">{t("set.askAfter")}</div>
          <p className="m-0 mt-0.5 text-[13px] leading-[1.5] text-app-ink-soft">{t("set.askAfterBody")}</p>
        </div>
        <Toggle on={autoRequest} onChange={setAutoRequest} label={t("set.askToggle")} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="requestDelayDays" className={field.label}>{t("set.days")}</label>
          <input id="requestDelayDays" name="requestDelayDays" type="number" min={0} max={30} defaultValue={initial.requestDelayDays} className={field.input} />
        </div>
        <div>
          <label htmlFor="requestChannel" className={field.label}>{t("req.sendBy")}</label>
          <select id="requestChannel" name="requestChannel" value={channel} onChange={(e) => setChannel(e.target.value)} className={field.select}>
            <option value="email">{t("req.email")}{ready.email ? "" : ` (${t("req.notSetUp")})`}</option>
            {(SMS_ENABLED || channel === "sms") && <option value="sms">SMS{ready.sms ? "" : ` (${t("req.notSetUp")})`}</option>}
            <option value="whatsapp">WhatsApp{ready.whatsapp ? "" : ` (${t("req.notSetUp")})`}</option>
          </select>
        </div>
      </div>
      {autoRequest && !ready[channel] ? <Notice tone="info">{t("set.notSetUp")}</Notice> : null}
      <div className="flex items-start justify-between gap-4 border-t border-app-line pt-4">
        <div>
          <div className="text-[15px] font-bold">{t("set.publish")}</div>
          <p className="m-0 mt-0.5 text-[13px] leading-[1.5] text-app-ink-soft">{t("set.publishBody")}</p>
        </div>
        <Toggle on={autoApprove} onChange={setAutoApprove} label={t("set.publishToggle")} />
      </div>
      {state ? <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice> : null}
      <PillButton type="submit" size="md" tone="ink" busy={pending} className="w-fit">{t("set.save")}</PillButton>
    </form>
  );
}
