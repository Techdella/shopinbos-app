"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Notice, PillButton, TextInput } from "@/components/app-ui";
import { cx } from "@/components/app-ui/cx";
import { Field } from "@/components/growth/kit";
import { Icon } from "@/components/ui/Icon";
import { fillReason, type Preset } from "@/lib/support/presets";
import type { Person, PersonRole } from "@/lib/support/people.server";
import { renderTeamTemplate, type TeamTemplate } from "@/lib/support/whatsapp-pure";
import { deskSelect } from "./ui";

// Admin › Inbox › New conversation: pick who (sellers, suppliers, delivery partners, leads, or type an address),
// then send by WhatsApp, email or in the app. After approving or rejecting a business it opens with the
// approval or "not yet" message ready, with a box for the reason. Replies come back into the inbox.

export type TemplateOption = TeamTemplate & { status: string | null };
type Channel = "whatsapp" | "email" | "app";

const ROLE_TABS: Array<{ id: PersonRole | ""; label: string }> = [
  { id: "", label: "Everyone" },
  { id: "seller", label: "Sellers" },
  { id: "supplier", label: "Suppliers" },
  { id: "logistics_partner", label: "Delivery partners" },
  { id: "lead", label: "Leads" },
];
const ROLE_LABEL: Record<string, string> = { seller: "Seller", supplier: "Supplier", logistics_partner: "Delivery partner", lead: "Lead" };

const textareaClass = "w-full resize-y rounded-[16px] border border-app-line bg-white px-4 py-3 text-[15px] leading-[1.55] outline-none placeholder:text-app-ink-faint focus:border-app-ink";

export function NewConversation({
  initial,
  templates,
  whatsappReady,
  emailReady,
  me,
}: {
  initial: { person: Person | null; channel: Channel | null; preset: (Preset & { done: string; back: string }) | null; name: string; email: string; phone: string };
  templates: TemplateOption[];
  whatsappReady: boolean;
  emailReady: boolean;
  me: string;
}) {
  const router = useRouter();
  const [person, setPerson] = useState<Person | null>(initial.person);
  const [manual, setManual] = useState(!initial.person && Boolean(initial.email || initial.phone));
  const [name, setName] = useState(initial.person?.name ?? initial.name);
  const [email, setEmail] = useState(initial.person?.email ?? initial.email);
  const [phone, setPhone] = useState(initial.person?.phone ?? initial.phone);
  const preset = initial.preset;
  const firstChannel: Channel = initial.channel ?? (initial.person?.email ? "email" : initial.person?.phone || initial.phone ? "whatsapp" : "email");
  const [channel, setChannel] = useState<Channel>(firstChannel);
  const [reason, setReason] = useState("");
  const [subject, setSubject] = useState(preset?.subject ?? "");
  const [message, setMessage] = useState(preset?.message ?? "");
  const usable = templates.filter((t) => t.status === "APPROVED");
  const [template, setTemplate] = useState(preset?.template ?? usable[0]?.name ?? templates[0]?.name ?? "");
  const [note, setNote] = useState(preset?.note ?? "");
  const [freeText, setFreeText] = useState("");
  const [waMode, setWaMode] = useState<"template" | "text">("template");
  const [windowOpen, setWindowOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Search
  const [role, setRole] = useState<PersonRole | "">("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (person || manual) return;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      const params = new URLSearchParams({ q: query, ...(role ? { role } : {}) });
      const response = await fetch(`/api/admin/support/people?${params}`).catch(() => null);
      const json = (await response?.json().catch(() => null)) as { data?: Person[] } | null;
      setResults(json?.data ?? []);
      setSearching(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, role, person, manual]);

  // Can we write freely on WhatsApp (they messaged in the last 24 hours)?
  useEffect(() => {
    setWindowOpen(false);
    if (channel !== "whatsapp" || phone.replace(/\D/g, "").length < 8) return;
    const timer = window.setTimeout(async () => {
      const response = await fetch(`/api/admin/support/whatsapp-window?phone=${encodeURIComponent(phone)}`).catch(() => null);
      const json = (await response?.json().catch(() => null)) as { data?: { open: boolean } } | null;
      setWindowOpen(Boolean(json?.data?.open));
      if (json?.data?.open && !preset) setWaMode("text");
    }, 300);
    return () => window.clearTimeout(timer);
  }, [channel, phone, preset]);

  const choose = (next: Person) => {
    setPerson(next);
    setName(next.name);
    setEmail(next.email ?? "");
    setPhone(next.phone ?? "");
    setChannel(next.email ? channel === "app" && !next.userId ? "email" : channel : next.phone ? "whatsapp" : next.userId ? "app" : channel);
  };

  const chosen = templates.find((t) => t.name === template) ?? null;
  const business = person?.business && person.role !== "lead" ? person.business : null;
  const finalMessage = fillReason(message, reason);
  const finalNote = fillReason(note, reason);
  const waPreview = chosen ? renderTeamTemplate(chosen, { name: name || null, agent: me, note: finalNote || "[your message]", business }) : "";
  const can = { whatsapp: Boolean(phone.trim()), email: Boolean(email.trim()), app: Boolean(person?.userId) };

  const submit = () =>
    start(async () => {
      setError(null);
      if (preset?.needsReason && !reason.trim()) return setError("Add the reason first, so they know what to fix.");
      const who = { name, userId: person?.userId ?? null, leadId: person?.leadId ?? null, business };
      const body =
        channel === "email"
          ? { ...who, channel, email, subject, message: finalMessage }
          : channel === "app"
            ? { ...who, channel, subject, message: finalMessage }
            : waMode === "text" && windowOpen
              ? { ...who, channel, phone, text: freeText }
              : { ...who, channel, phone, template, note: finalNote };
      const response = await fetch("/api/admin/support/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
      const json = (await response?.json().catch(() => null)) as { data?: { number?: number }; error?: { message?: string } } | null;
      if (!response?.ok || !json?.data?.number) return setError(json?.error?.message ?? "That didn't send. Try again.");
      router.push(`/admin/support/${json.data.number}`);
    });

  const roleTabs = useMemo(() => ROLE_TABS, []);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-4">
        {preset && (
          <div className="flex flex-wrap items-center gap-3 rounded-[18px] bg-app-success-tint px-4 py-3 text-[14px] font-semibold text-app-success">
            <Icon name="check" size={16} /> <span className="min-w-0 flex-1">{preset.done} Let them know below.</span>
            <Link href={preset.back} className="font-bold text-app-ink underline">Skip</Link>
          </div>
        )}

        {/* Who */}
        <section className="rounded-[22px] border border-app-line bg-white p-5">
          <h2 className="m-0 mb-3 text-[15px] font-extrabold">To</h2>
          {person ? (
            <div className="flex flex-wrap items-center gap-3 rounded-[16px] bg-app-canvas p-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-app-ink text-[14px] font-extrabold text-white" aria-hidden>{person.name.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-extrabold">{person.name}{person.business && person.business !== person.name ? ` · ${person.business}` : ""}</div>
                <div className="truncate text-[13px] text-app-ink-soft">{ROLE_LABEL[person.role]}{person.status ? ` (${person.status})` : ""} · {[person.email, person.phone].filter(Boolean).join(" · ") || "no email or phone"}</div>
              </div>
              <button type="button" onClick={() => { setPerson(null); setResults([]); }} className="min-h-[36px] rounded-full border border-app-line bg-white px-3.5 text-[13px] font-bold">Change</button>
            </div>
          ) : manual ? (
            <div className="grid gap-3">
              <Field label="Name" htmlFor="nc-name"><TextInput id="nc-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Ada Okafor" /></Field>
              <Field label="Email" htmlFor="nc-email"><TextInput id="nc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ada@example.com" /></Field>
              <Field label="WhatsApp number" htmlFor="nc-phone" hint="With the country code. 0803… numbers are read as Nigerian."><TextInput id="nc-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234 803 412 7790" /></Field>
              <button type="button" onClick={() => setManual(false)} className="w-fit text-[13.5px] font-bold text-app-ink underline">Choose from the list instead</button>
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Who">
                {roleTabs.map((tab) => (
                  <button key={tab.id} type="button" role="tab" aria-selected={role === tab.id} onClick={() => setRole(tab.id)} className={cx("min-h-[34px] rounded-full border px-3 text-[13px] font-bold", role === tab.id ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink")}>
                    {tab.label}
                  </button>
                ))}
              </div>
              <label className="sr-only" htmlFor="nc-search">Search</label>
              <TextInput id="nc-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, business, email or phone" autoFocus />
              <ul className="m-0 max-h-[320px] list-none divide-y divide-app-line overflow-y-auto rounded-[16px] border border-app-line p-0">
                {results.map((result) => (
                  <li key={result.key}>
                    <button type="button" onClick={() => choose(result)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-app-canvas">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-bold">{result.name}{result.business && result.business !== result.name ? ` · ${result.business}` : ""}</span>
                        <span className="block truncate text-[12.5px] text-app-ink-soft">{[result.email, result.phone].filter(Boolean).join(" · ") || "no email or phone"}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-app-canvas px-2 py-0.5 text-[11.5px] font-bold text-app-ink-soft">{ROLE_LABEL[result.role]}</span>
                    </button>
                  </li>
                ))}
                {!results.length && <li className="px-3.5 py-3 text-[13.5px] text-app-ink-soft">{searching ? "Searching…" : "Nobody matches. Try another name, or type their details."}</li>}
              </ul>
              <button type="button" onClick={() => setManual(true)} className="w-fit text-[13.5px] font-bold text-app-ink underline">Type an email or number instead</button>
            </div>
          )}
        </section>

        {/* How and what */}
        <form
          className="flex flex-col gap-4 rounded-[22px] border border-app-line bg-white p-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div role="tablist" aria-label="Send by" className="flex w-fit flex-wrap rounded-full bg-app-canvas p-1">
            {(["whatsapp", "email", "app"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={channel === value}
                disabled={!can[value] && !(manual && value !== "app")}
                onClick={() => setChannel(value)}
                className={cx("inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-4 text-[13.5px] font-bold disabled:opacity-40", channel === value ? "bg-white text-app-ink shadow-sm" : "text-app-ink-soft")}
              >
                <Icon name={value === "whatsapp" ? "whatsapp" : value === "email" ? "mail" : "bell"} size={14} /> {value === "whatsapp" ? "WhatsApp" : value === "email" ? "Email" : "In the app"}
              </button>
            ))}
          </div>

          {preset && (
            <Field label={preset.needsReason ? "Reason (they'll see this)" : "Anything to add? (optional)"} htmlFor="nc-reason" hint={preset.needsReason ? "e.g. the CAC certificate you uploaded is unreadable, please upload a clearer copy" : "e.g. Your first order will show on your dashboard."}>
              <textarea id="nc-reason" rows={3} maxLength={600} value={reason} onChange={(e) => setReason(e.target.value)} className={textareaClass} />
            </Field>
          )}

          {channel === "whatsapp" ? (
            <>
              {!whatsappReady && <Notice tone="info">The WhatsApp number isn&apos;t connected on the server yet.</Notice>}
              {windowOpen && (
                <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
                  <span className="font-semibold text-app-success">They messaged in the last 24 hours, so you can write freely.</span>
                  <button type="button" onClick={() => setWaMode(waMode === "text" ? "template" : "text")} className="font-bold text-app-ink underline">{waMode === "text" ? "Use a template" : "Write a message"}</button>
                </div>
              )}
              {waMode === "text" && windowOpen ? (
                <Field label="Message" htmlFor="nc-text">
                  <textarea id="nc-text" required rows={6} maxLength={4000} value={freeText} onChange={(e) => setFreeText(e.target.value)} className={textareaClass} />
                </Field>
              ) : (
                <>
                  <Field label="Template" htmlFor="nc-template" hint={<>To start a chat WhatsApp needs a template Meta approved. <Link href="/admin/support/templates" className="font-bold text-app-ink underline">Manage templates</Link></>}>
                    <select id="nc-template" className={`${deskSelect} w-full`} value={template} onChange={(e) => setTemplate(e.target.value)}>
                      {templates.map((t) => <option key={t.name} value={t.name}>{t.purpose}{t.status === "APPROVED" ? "" : t.status ? ` (${t.status.toLowerCase()})` : " (not submitted)"}</option>)}
                    </select>
                  </Field>
                  {chosen && chosen.status !== "APPROVED" && <Notice tone="info">Meta hasn&apos;t approved this template yet, so it can&apos;t be sent. Pick an approved one or check Templates.</Notice>}
                  {chosen?.params.includes("note") && (
                    <Field label="Your message (goes inside the template)" htmlFor="nc-note" hint={preset ? "{{reason}} is replaced with the reason above." : "One paragraph."}>
                      <textarea id="nc-note" required rows={4} maxLength={900} value={note} onChange={(e) => setNote(e.target.value)} className={textareaClass} />
                    </Field>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              {channel === "email" && !emailReady && <Notice tone="info">Email isn&apos;t set up on the server (RESEND_API_KEY).</Notice>}
              {channel === "app" && <p className="m-0 text-[13.5px] text-app-ink-soft">It shows in their Shopinbos support chat with a notification, and they can reply there.</p>}
              <Field label="Subject" htmlFor="nc-subject">
                <TextInput id="nc-subject" required value={subject} maxLength={160} onChange={(e) => setSubject(e.target.value)} placeholder="Your Shopinbos account" />
              </Field>
              <Field label="Message" htmlFor="nc-message" hint={preset ? "{{reason}} is replaced with the reason above." : "Their reply comes back into this inbox."}>
                <textarea id="nc-message" required rows={9} maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} className={textareaClass} placeholder={`Hi ${name.split(" ")[0] || "there"},\n\n`} />
              </Field>
            </>
          )}

          {error && <Notice>{error}</Notice>}
          <div className="flex flex-wrap items-center gap-3">
            <PillButton type="submit" size="md" busy={pending} disabled={pending || (!person && !manual)}>
              {channel === "email" ? "Send email" : channel === "app" ? "Send in the app" : "Send on WhatsApp"}
            </PillButton>
            {!person && !manual && <span className="text-[13px] text-app-ink-soft">Choose who it&apos;s for first.</span>}
          </div>
        </form>
      </div>

      <aside className="min-w-0 self-start rounded-[22px] border border-app-line bg-white p-5">
        <h2 className="m-0 mb-3 text-[15px] font-extrabold">Preview</h2>
        {channel === "whatsapp" ? (
          <div className="rounded-[18px] bg-[#E7F1EC] p-3">
            <div className="whitespace-pre-wrap rounded-[12px] rounded-tl-[4px] bg-white px-3 py-2 text-[14px] leading-[1.5]">{waMode === "text" && windowOpen ? freeText || "Your message" : waPreview}</div>
          </div>
        ) : (
          <div className="text-[14px] leading-[1.55]">
            <div className="mb-2 font-extrabold">{subject || "Subject"}</div>
            <div className="whitespace-pre-wrap text-app-ink-soft">{finalMessage || "Your message"}</div>
          </div>
        )}
      </aside>
    </div>
  );
}
