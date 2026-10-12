"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { FieldLabel, Mascot, Notice, PillButton, TextInput, cx } from "@/components/app-ui";
import { SUPPORT_EMAIL, TOPICS, attachmentProblem, type SupportTopic } from "@/lib/support/pure";

// The signed-out "Stuck?" panel on login, signup and password reset: opens a support ticket with the team
// (POST /api/support/requests) instead of a mailto link. Bottom sheet on phones, dialog on desktop.

type Sent = { ticket: string | null; replyBy: "email" | "whatsapp" };

export function SupportRequestPanel({ open, onClose, defaultTopic = "login" }: { open: boolean; onClose: () => void; defaultTopic?: SupportTopic }) {
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const startedAt = useRef(0);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [topic, setTopic] = useState<SupportTopic>(defaultTopic);
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);

  useEffect(() => {
    if (!open) return;
    startedAt.current = Date.now();
    const previous = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => firstFieldRef.current?.focus(), 30);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      // Keep Tab inside the dialog.
      if (event.key === "Tab" && dialogRef.current) {
        const items = dialogRef.current.querySelectorAll<HTMLElement>("button, a[href], input:not([tabindex='-1']), textarea, select");
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const pickFile = (picked: File | null) => {
    setError(null);
    if (!picked) return setFile(null);
    const problem = attachmentProblem(picked);
    if (problem) {
      setError(problem);
      return;
    }
    setFile(picked);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (!name.trim()) return setError("Tell us your name.");
    if (!contact.trim()) return setError("Add an email or phone number so we can reply.");
    if (message.trim().length < 5) return setError("Tell us a little more so we can help.");
    setBusy(true);
    try {
      const form = new FormData();
      form.set("name", name.trim());
      form.set("contact", contact.trim());
      form.set("topic", topic);
      form.set("message", message.trim());
      form.set("path", window.location.pathname);
      form.set("website", honeypot);
      form.set("startedAt", String(startedAt.current));
      if (file) form.set("file", file);
      const response = await fetch("/api/support/requests", { method: "POST", body: form });
      const json = (await response.json().catch(() => null)) as { data?: { ticket: string | null; replyBy?: "email" | "whatsapp" }; error?: { message?: string } } | null;
      if (!response.ok || !json?.data) {
        setError(json?.error?.message ?? `We couldn't send that. Email ${SUPPORT_EMAIL} and a person will reply.`);
        return;
      }
      setSent({ ticket: json.data.ticket, replyBy: json.data.replyBy ?? "email" });
    } catch {
      setError(`You look offline. Check your connection, or email ${SUPPORT_EMAIL}.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center font-app text-app-ink sm:items-center sm:p-6">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-[rgba(22,20,31,0.45)]" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[0_24px_60px_-20px_rgba(22,20,31,0.45)] sm:max-w-[540px] sm:rounded-[28px]"
      >
        <div className="flex items-start gap-3 border-b border-app-line px-5 pb-4 pt-5 sm:px-7">
          <Mascot name="peggy" className="h-11 w-11 shrink-0" alt="" />
          <div className="min-w-0 flex-1">
            <h2 id={`${id}-title`} className="m-0 text-[19px] font-extrabold tracking-[-0.2px]">
              {sent ? "We've got it" : "Talk to the Shopinbos team"}
            </h2>
            <p className="m-0 mt-0.5 text-[13.5px] leading-[1.45] text-app-ink-soft">A real person replies, in English or Pidgin.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-app-canvas text-app-ink-soft hover:text-app-ink">
            <Icon name="x" size={16} />
          </button>
        </div>

        {sent ? (
          <div className="px-5 py-6 sm:px-7" role="status">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-app-success-tint text-app-success">
              <Icon name="check" size={22} />
            </div>
            <p className="m-0 text-[16px] font-bold leading-[1.5]">
              {sent.ticket ? <>Your ticket is <span className="font-extrabold">#{sent.ticket}</span>.</> : "Your message is with the team."}
            </p>
            <p className="m-0 mt-2 text-[15px] leading-[1.55] text-app-ink-soft">
              We&apos;ll reply by {sent.replyBy === "email" ? "email" : "WhatsApp or SMS"}, usually within an hour.
              {sent.ticket && sent.replyBy === "email" ? " Reply to our email to add anything." : ""}
            </p>
            <PillButton tone="ink" size="md" className="mt-6 w-full sm:w-auto" onClick={onClose}>
              Done
            </PillButton>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-7">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor={`${id}-name`}>Your name</FieldLabel>
                  <TextInput ref={firstFieldRef} id={`${id}-name`} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={120} className="h-[48px]" />
                </div>
                <div>
                  <FieldLabel htmlFor={`${id}-contact`}>Email or phone</FieldLabel>
                  <TextInput id={`${id}-contact`} value={contact} onChange={(event) => setContact(event.target.value)} autoComplete="email" inputMode="email" placeholder="you@shop.com or 0803…" maxLength={160} className="h-[48px]" />
                </div>
              </div>

              <fieldset className="m-0 border-0 p-0">
                <legend className="mb-2 block p-0 text-[14px] font-bold text-app-ink">What&apos;s it about?</legend>
                <div className="flex flex-wrap gap-2">
                  {TOPICS.map((item) => (
                    <label
                      key={item.value}
                      className={cx(
                        "inline-flex min-h-[40px] cursor-pointer items-center rounded-full border px-3.5 text-[13.5px] font-bold transition focus-within:ring-2 focus-within:ring-app-ink/30",
                        topic === item.value ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
                      )}
                    >
                      <input type="radio" name={`${id}-topic`} value={item.value} checked={topic === item.value} onChange={() => setTopic(item.value)} className="sr-only" />
                      {item.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <FieldLabel htmlFor={`${id}-message`}>How can we help?</FieldLabel>
                <textarea
                  id={`${id}-message`}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={4}
                  maxLength={5000}
                  placeholder="What happened, and what you were trying to do."
                  className="w-full resize-y rounded-[16px] border border-app-line bg-white px-4 py-3 text-[16px] leading-[1.5] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink"
                />
              </div>

              <div>
                <label htmlFor={`${id}-file`} className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full border border-dashed border-app-line-strong px-3.5 text-[13.5px] font-bold text-app-ink hover:bg-app-canvas focus-within:ring-2 focus-within:ring-app-ink/30">
                  <Icon name="paperclip" size={15} />
                  {file ? "Change screenshot" : "Add a screenshot (optional)"}
                  <input id={`${id}-file`} type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" className="sr-only" onChange={(event) => pickFile(event.target.files?.[0] ?? null)} />
                </label>
                {file && (
                  <div className="mt-2 flex items-center gap-2 text-[13px] text-app-ink-soft">
                    <span className="truncate">{file.name}</span>
                    <button type="button" onClick={() => setFile(null)} className="font-bold text-app-ink underline">
                      Remove
                    </button>
                  </div>
                )}
              </div>

              {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
              <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
                <label htmlFor={`${id}-website`}>Website</label>
                <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
              </div>

              {error && <Notice>{error}</Notice>}
            </div>

            <div className="flex flex-col-reverse items-stretch gap-3 border-t border-app-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-center text-[13.5px] font-semibold text-app-ink-soft underline-offset-2 hover:text-app-ink hover:underline">
                or email {SUPPORT_EMAIL}
              </a>
              <PillButton type="submit" tone="accent" size="md" busy={busy}>
                Send to the team
              </PillButton>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
