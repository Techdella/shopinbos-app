"use client";

import { useRef, useState } from "react";
import { createInboxTemplate } from "@/app/actions/admin-lead-growth";
import { TextInput } from "@/components/app-ui";
import { Field } from "@/components/growth/kit";
import { TEMPLATE_PLACEHOLDERS, templateFromDraft } from "@/lib/support/whatsapp-pure";
import { deskSelect } from "./ui";

// Admin › Inbox › WhatsApp templates: write a template with {{first_name}}, {{business}}, {{agent}} and
// {{message}}, see it as WhatsApp will show it, and send it to Meta for approval.

const textareaClass = "w-full resize-y rounded-[16px] border border-app-line bg-white px-4 py-3 text-[15px] leading-[1.55] outline-none placeholder:text-app-ink-faint focus:border-app-ink";

export function TemplateForm({ initial }: { initial: { name: string; purpose: string; category: string; body: string } }) {
  const [name, setName] = useState(initial.name);
  const [purpose, setPurpose] = useState(initial.purpose);
  const [category, setCategory] = useState(initial.category || "UTILITY");
  const [body, setBody] = useState(initial.body);
  const area = useRef<HTMLTextAreaElement>(null);

  const insert = (key: string) => {
    const el = area.current;
    const token = `{{${key}}}`;
    if (!el) return setBody((b) => `${b}${token}`);
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    setBody(`${body.slice(0, start)}${token}${body.slice(end)}`);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const built = body.trim() ? templateFromDraft({ name: name || "draft", purpose: purpose || "draft", category, body }) : null;
  const preview = built?.ok ? built.template.body.replace(/\{\{(\d+)\}\}/g, (_, i: string) => built.template.sample[Number(i) - 1] ?? "") : null;

  return (
    <form action={createInboxTemplate} className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid min-w-0 gap-3">
        <Field label="Name" htmlFor="tp-name" hint="Lower case, no spaces needed: it's saved as shopinbos_… and can't be changed later.">
          <TextInput id="tp-name" name="name" required value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="supplier welcome" />
        </Field>
        <Field label="What it's for" htmlFor="tp-purpose" hint="Shown when the team picks a template.">
          <TextInput id="tp-purpose" name="purpose" required value={purpose} maxLength={120} onChange={(e) => setPurpose(e.target.value)} placeholder="Welcome a new supplier" />
        </Field>
        <Field label="Kind" htmlFor="tp-category" hint="Utility: about their account, an order or a request. Marketing: promotions and news. Meta may change it.">
          <select id="tp-category" name="category" className={`${deskSelect} w-full`} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="UTILITY">Utility (account and service updates)</option>
            <option value="MARKETING">Marketing (offers and news)</option>
          </select>
        </Field>
        <Field label="Message" htmlFor="tp-body" hint="Tap to add a detail that's filled in when sending. WhatsApp doesn't allow one at the very start or end.">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {TEMPLATE_PLACEHOLDERS.map((p) => (
              <button key={p.key} type="button" onClick={() => insert(p.key)} className="min-h-[32px] rounded-full border border-app-line bg-white px-3 text-[12.5px] font-bold hover:border-app-ink" title={p.label}>
                + {p.label}
              </button>
            ))}
          </div>
          <textarea ref={area} id="tp-body" name="body" required rows={7} maxLength={1024} value={body} onChange={(e) => setBody(e.target.value)} className={textareaClass} placeholder={"Hi {{first_name}}, welcome to Shopinbos! {{message}}\n\nReply here if you need anything."} />
        </Field>
        <div>
          <button type="submit" className="inline-flex min-h-[44px] items-center rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white hover:bg-black">Save and send to Meta</button>
        </div>
      </div>
      <aside className="min-w-0 self-start">
        <div className="mb-2 text-[13px] font-extrabold uppercase tracking-[0.06em] text-app-ink-soft">Preview</div>
        <div className="rounded-[18px] bg-[#E7F1EC] p-3">
          <div className="whitespace-pre-wrap rounded-[12px] rounded-tl-[4px] bg-white px-3 py-2 text-[14px] leading-[1.5]">{preview ?? (body || "Your message")}</div>
        </div>
        {built && !built.ok && <p className="mb-0 mt-2 text-[13px] font-semibold text-app-danger">{built.error}</p>}
      </aside>
    </form>
  );
}
