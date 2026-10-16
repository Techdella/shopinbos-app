"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveLeadCampaign } from "@/app/actions/admin-lead-growth";
import { Card, CardHead } from "@/components/app-kit";
import { Notice, PillButton, TextInput } from "@/components/app-ui";
import { Field } from "@/components/growth/kit";
import type { PlatformLegal } from "@/lib/email/shell";
import type { LeadAudienceType, LeadChannel } from "@/lib/lead-growth/pure";
import { AudiencePicker, EMPTY_AUDIENCE, MessageEditor, MessagePreview, TestSend, draftToContent, type MessageDraft, type Readiness } from "./LeadGrowthFields";

// /admin/lead-campaigns/new and /[id]: a one-off email, SMS or WhatsApp message to a slice of the leads.
// Save as a draft here; sending and scheduling are on the campaign's page once it is saved.

export type CampaignDraftInput = {
  id: string | null;
  name: string;
  audience: LeadAudienceType;
  channel: LeadChannel;
  subject: string | null;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  waTemplate: string | null;
  waLanguage: string | null;
};

const STARTERS: Record<LeadChannel, Pick<MessageDraft, "subject" | "body">> = {
  email: {
    subject: "{{first_name}}, your online store is one click away",
    body: "Hi {{first_name}},\n\nThanks for stopping by Shopinbos. Thousands of African businesses use it to sell online: a store built for you by Chip, our AI, products from trusted suppliers, and delivery partners in your city.\n\nIt takes about five minutes and it's free to start.",
  },
  sms: { subject: "", body: "Hi {{first_name}}, your free Shopinbos store is ready to set up. Start selling online in 5 mins: {{signup_link}}" },
  whatsapp: { subject: "", body: "Hi {{first_name}} 👋 Thanks for checking out Shopinbos! Chip, our AI, can build your online store in about 5 minutes. Start free here: {{signup_link}}" },
};

export function LeadCampaignEditor({ initial, readiness, kinds, legal, appUrl, locked }: { initial: CampaignDraftInput | null; readiness: Readiness; kinds: Array<{ key: string; label: string }>; legal: PlatformLegal; appUrl: string; locked: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [audience, setAudience] = useState<LeadAudienceType>(initial?.audience ?? EMPTY_AUDIENCE);
  const [draft, setDraft] = useState<MessageDraft>(() => ({
    channel: initial?.channel ?? "email",
    subject: initial?.subject ?? STARTERS.email.subject,
    body: initial?.body ?? STARTERS.email.body,
    ctaLabel: initial?.ctaLabel ?? "",
    ctaUrl: initial?.ctaUrl ?? "",
    waTemplate: initial?.waTemplate ?? "",
    waLanguage: initial?.waLanguage ?? "en",
  }));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const changeDraft = (next: MessageDraft) => {
    // Switching channel on an untouched starter swaps in that channel's starter.
    if (next.channel !== draft.channel && draft.body === STARTERS[draft.channel].body) next = { ...next, ...STARTERS[next.channel], subject: next.channel === "email" ? STARTERS.email.subject : next.subject };
    setDraft(next);
    setSaved(false);
  };

  const save = () =>
    start(async () => {
      setError(null);
      const result = await saveLeadCampaign({ id: initial?.id, name, audience, content: draftToContent(draft) });
      if (!result.ok) return setError(result.error);
      setSaved(true);
      if (!initial?.id && result.id) router.push(`/admin/lead-campaigns/${result.id}`);
      else router.refresh();
    });

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Card className="p-5">
          <CardHead title="Name" sub="Only admins see it. It's also the utm_campaign tag on the links." />
          <TextInput aria-label="Campaign name" value={name} maxLength={120} placeholder="Newsletter sign-ups – October nudge" disabled={locked} onChange={(e) => setName(e.target.value)} />
        </Card>
        <Card className="p-5">
          <CardHead title="Who gets it" />
          <AudiencePicker value={audience} onChange={setAudience} kinds={kinds} />
        </Card>
        <Card className="p-5">
          <CardHead title="Message" />
          <MessageEditor idPrefix="camp" value={draft} onChange={changeDraft} readiness={readiness} />
        </Card>
        {error && <Notice>{error}</Notice>}
        {saved && <Notice tone="success">Saved.</Notice>}
        {locked ? (
          <Notice tone="info">This campaign has gone out (or is going out), so it can't be changed.</Notice>
        ) : (
          <div className="flex flex-wrap gap-2">
            <PillButton type="button" busy={pending} disabled={pending} onClick={save}>
              {initial?.id ? "Save changes" : "Save draft"}
            </PillButton>
          </div>
        )}
      </div>
      <aside className="flex min-w-0 flex-col gap-4">
        <Card className="p-5">
          <CardHead title="Preview" />
          <MessagePreview value={draft} legal={legal} appUrl={appUrl} />
        </Card>
        <Card className="p-5">
          <CardHead title="Send yourself a test" sub="Filled in as if for a lead called Ada." />
          <TestSend value={draft} name={name} />
        </Card>
      </aside>
    </div>
  );
}
