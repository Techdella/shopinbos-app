"use client";

import { Card, CardHead } from "@/components/app-kit";
import type { TemplateContent } from "@/lib/marketing/text-channels";
import { EmailPreview } from "../../_kit/client";
import { WhatsAppBubble } from "../../_kit/text";
import { TextPreview } from "./TextPreview";

export function SentCampaignPreview({
  channel,
  bodyHtml,
  preheader,
  subject,
  whatsapp,
}: {
  channel: string;
  bodyHtml: string;
  preheader: string | null;
  subject: string;
  whatsapp?: { content: TemplateContent; mapping: string[]; headerImageUrl: string | null } | null;
}) {
  return (
    <Card className="p-5">
      <CardHead title="What was sent" />
      <div className="mt-3">
        {channel === "email" ? (
          <EmailPreview bodyHtml={bodyHtml} preheader={preheader} subject={subject} />
        ) : channel === "whatsapp" && whatsapp ? (
          <WhatsAppBubble content={whatsapp.content} mapping={whatsapp.mapping} headerImageUrl={whatsapp.headerImageUrl} />
        ) : (
          <TextPreview channel={channel === "sms" ? "sms" : "whatsapp"} message={bodyHtml} />
        )}
      </div>
    </Card>
  );
}
