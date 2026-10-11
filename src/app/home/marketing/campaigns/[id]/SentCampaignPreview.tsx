"use client";

import { Card, CardHead } from "@/components/app-kit";
import { EmailPreview } from "../../_kit/client";
import { TextPreview } from "./TextPreview";

export function SentCampaignPreview({ channel, bodyHtml, preheader, subject }: { channel: string; bodyHtml: string; preheader: string | null; subject: string }) {
  return (
    <Card className="p-5">
      <CardHead title="What was sent" />
      <div className="mt-3">{channel === "email" ? <EmailPreview bodyHtml={bodyHtml} preheader={preheader} subject={subject} /> : <TextPreview channel={channel === "sms" ? "sms" : "whatsapp"} message={bodyHtml} />}</div>
    </Card>
  );
}
