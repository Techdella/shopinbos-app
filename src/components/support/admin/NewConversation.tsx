"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Notice, PillButton, TextInput } from "@/components/app-ui";
import { cx } from "@/components/app-ui/cx";
import { Field } from "@/components/growth/kit";
import { Icon } from "@/components/ui/Icon";
import { TEAM_TEMPLATES, renderTeamTemplate, teamTemplate } from "@/lib/support/whatsapp-pure";
import { deskSelect } from "./ui";

// Admin › Inbox › New conversation: write first, by email or WhatsApp. Replies come back into the inbox.
// WhatsApp only lets a business start a chat with an approved template, so the WhatsApp side picks one.

export type TemplateState = { name: string; status: string | null };

const textareaClass = "w-full resize-y rounded-[16px] border border-app-line bg-white px-4 py-3 text-[15px] leading-[1.55] outline-none placeholder:text-app-ink-faint focus:border-app-ink";

export function NewConversation({
  initial,
  templates,
  whatsappReady,
  emailReady,
  me,
}: {
  initial: { channel: "email" | "whatsapp"; name: string; email: string; phone: string };
  templates: TemplateState[];
  whatsappReady: boolean;
  emailReady: boolean;
  me: string;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState(initial.channel);
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [template, setTemplate] = useState(TEAM_TEMPLATES[0]!.name);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const chosen = teamTemplate(template)!;
  const status = templates.find((t) => t.name === template)?.status ?? null;
  const preview = renderTeamTemplate(chosen, { name: name || null, agent: me, note: note || "[your message]" });

  const submit = () =>
    start(async () => {
      setError(null);
      const body = channel === "email" ? { channel, name, email, subject, message } : { channel, name, phone, template, note };
      const response = await fetch("/api/admin/support/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
      const json = (await response?.json().catch(() => null)) as { data?: { number?: number }; error?: { message?: string } } | null;
      if (!response?.ok || !json?.data?.number) return setError(json?.error?.message ?? "That didn't send. Try again.");
      router.push(`/admin/support/${json.data.number}`);
    });

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <form
        className="flex min-w-0 flex-col gap-4 rounded-[22px] border border-app-line bg-white p-5"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div role="tablist" aria-label="Channel" className="flex w-fit rounded-full bg-app-canvas p-1">
          {(["whatsapp", "email"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={channel === value}
              onClick={() => setChannel(value)}
              className={cx("inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-4 text-[13.5px] font-bold", channel === value ? "bg-white text-app-ink shadow-sm" : "text-app-ink-soft")}
            >
              <Icon name={value === "whatsapp" ? "whatsapp" : "mail"} size={14} /> {value === "whatsapp" ? "WhatsApp" : "Email"}
            </button>
          ))}
        </div>

        <Field label="Their name" htmlFor="nc-name" hint="Used to greet them. Optional.">
          <TextInput id="nc-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Ada Okafor" />
        </Field>

        {channel === "email" ? (
          <>
            {!emailReady && <Notice tone="info">Email isn't set up on the server (RESEND_API_KEY), so this can't send yet.</Notice>}
            <Field label="Email" htmlFor="nc-email">
              <TextInput id="nc-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ada@example.com" />
            </Field>
            <Field label="Subject" htmlFor="nc-subject">
              <TextInput id="nc-subject" required value={subject} maxLength={160} onChange={(e) => setSubject(e.target.value)} placeholder="Your Shopinbos supplier account" />
            </Field>
            <Field label="Message" htmlFor="nc-message" hint="Their reply comes back into this inbox.">
              <textarea id="nc-message" required rows={8} maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} className={textareaClass} placeholder={`Hi ${name.split(" ")[0] || "there"},\n\n`} />
            </Field>
          </>
        ) : (
          <>
            {!whatsappReady && <Notice tone="info">The WhatsApp number isn't connected on the server yet (WHATSAPP_LEADS_TOKEN and WHATSAPP_LEADS_PHONE_NUMBER_ID).</Notice>}
            <Field label="WhatsApp number" htmlFor="nc-phone" hint="With the country code. 0803… numbers are read as Nigerian.">
              <TextInput id="nc-phone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234 803 412 7790" />
            </Field>
            <Field label="Template" htmlFor="nc-template" hint="WhatsApp only lets a business start a chat with a template Meta has approved. Once they reply you can write freely for 24 hours.">
              <select id="nc-template" className={`${deskSelect} w-full`} value={template} onChange={(e) => setTemplate(e.target.value)}>
                {TEAM_TEMPLATES.map((t) => <option key={t.name} value={t.name}>{t.purpose}</option>)}
              </select>
            </Field>
            {status !== "APPROVED" && (
              <Notice tone="info">
                {status ? `Meta hasn't approved this template yet (${status.toLowerCase()}).` : "This template hasn't been sent to Meta yet."} Submit it from Leads › WhatsApp.
              </Notice>
            )}
            {chosen.params.includes("note") && (
              <Field label="Your message" htmlFor="nc-note" hint="One paragraph. WhatsApp puts it inside the template.">
                <textarea id="nc-note" required rows={4} maxLength={900} value={note} onChange={(e) => setNote(e.target.value)} className={textareaClass} placeholder="Your supplier account is approved, so you can add your products now." />
              </Field>
            )}
          </>
        )}

        {error && <Notice>{error}</Notice>}
        <div>
          <PillButton type="submit" size="md" busy={pending} disabled={pending}>
            {channel === "email" ? "Send email" : "Send on WhatsApp"}
          </PillButton>
        </div>
      </form>

      <aside className="min-w-0 rounded-[22px] border border-app-line bg-white p-5">
        <h2 className="m-0 mb-3 text-[15px] font-extrabold">Preview</h2>
        {channel === "whatsapp" ? (
          <div className="rounded-[18px] bg-[#E7F1EC] p-3">
            <div className="whitespace-pre-wrap rounded-[12px] rounded-tl-[4px] bg-white px-3 py-2 text-[14px] leading-[1.5]">{preview}</div>
          </div>
        ) : (
          <div className="text-[14px] leading-[1.55]">
            <div className="mb-2 font-extrabold">{subject || "Subject"}</div>
            <div className="whitespace-pre-wrap text-app-ink-soft">{message || "Your message"}</div>
            <p className="mb-0 mt-3 text-[12.5px] text-app-ink-faint">Sent from Shopinbos with the conversation number in the subject, so replies come back here.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
