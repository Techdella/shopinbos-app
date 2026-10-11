"use client";

import { useActionState, useState } from "react";
import { saveReviewSettings, type ActionState } from "@/app/actions/reviews";
import { Notice, PillButton, Toggle } from "@/components/app-ui";
import { field } from "@/components/seller-core";

export function SettingsForm({ initial, ready }: { initial: { autoRequest: boolean; requestDelayDays: number; requestChannel: string; autoApprove: boolean }; ready: Record<string, boolean> }) {
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
          <div className="text-[15px] font-bold">Ask after delivery</div>
          <p className="m-0 mt-0.5 text-[13px] leading-[1.5] text-app-ink-soft">Every day we ask buyers whose orders were marked delivered. Each buyer is asked once.</p>
        </div>
        <Toggle on={autoRequest} onChange={setAutoRequest} label="Ask buyers for a review after delivery" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="requestDelayDays" className={field.label}>Days after delivery</label>
          <input id="requestDelayDays" name="requestDelayDays" type="number" min={0} max={30} defaultValue={initial.requestDelayDays} className={field.input} />
        </div>
        <div>
          <label htmlFor="requestChannel" className={field.label}>Send by</label>
          <select id="requestChannel" name="requestChannel" value={channel} onChange={(e) => setChannel(e.target.value)} className={field.select}>
            <option value="email">Email{ready.email ? "" : " (not set up)"}</option>
            <option value="sms">SMS{ready.sms ? "" : " (not set up)"}</option>
            <option value="whatsapp">WhatsApp{ready.whatsapp ? "" : " (not set up)"}</option>
          </select>
        </div>
      </div>
      {autoRequest && !ready[channel] ? <Notice tone="info">This channel isn&apos;t set up on the platform yet, so automatic requests will be skipped until it is.</Notice> : null}
      <div className="flex items-start justify-between gap-4 border-t border-app-line pt-4">
        <div>
          <div className="text-[15px] font-bold">Publish new reviews straight away</div>
          <p className="m-0 mt-0.5 text-[13px] leading-[1.5] text-app-ink-soft">Off: new store reviews wait for you to publish them. You can hide any review later either way.</p>
        </div>
        <Toggle on={autoApprove} onChange={setAutoApprove} label="Publish new reviews without checking them first" />
      </div>
      {state ? <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice> : null}
      <PillButton type="submit" size="md" tone="ink" busy={pending} className="w-fit">Save settings</PillButton>
    </form>
  );
}
