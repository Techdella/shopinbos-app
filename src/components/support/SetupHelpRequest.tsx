"use client";

import { useId, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { FieldLabel, Notice, PillButton, TextInput, cx } from "@/components/app-ui";

// "We'll set it up for you": instead of showing API keys, DNS records or feed links, technical jobs become a
// short request to the Shopinbos team. It opens a support ticket (topic "setup") that lands in the admin
// support desk, so a person can do the work and message the customer back on WhatsApp.

export interface SetupHelpRequestProps {
  /** What they want set up, in plain words: "Connect your delivery software". */
  title: string;
  /** One or two sentences: what we'll do for them. */
  description: string;
  /** Short key for the team, e.g. "logistics_api". Goes in the ticket subject. */
  feature: string;
  /** Label for the optional "which software" question; omit to hide it. */
  softwareQuestion?: string;
  softwarePlaceholder?: string;
  className?: string;
}

const PHONE = /^\+?[\d\s-]{7,20}$/;

export function SetupHelpRequest({ title, description, feature, softwareQuestion, softwarePlaceholder, className }: SetupHelpRequestProps) {
  const id = useId();
  const [software, setSoftware] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (whatsapp.trim() && !PHONE.test(whatsapp.trim())) {
      setError("That WhatsApp number doesn't look right. Check it, or leave it empty and we'll reply here.");
      return;
    }
    setBusy(true);
    try {
      const lines = [
        `Please help me: ${title}.`,
        softwareQuestion && software.trim() ? `${softwareQuestion} ${software.trim()}` : null,
        whatsapp.trim() ? `Reach me on WhatsApp: ${whatsapp.trim()}` : "Reply here in the app.",
        details.trim() ? `More details: ${details.trim()}` : null,
      ].filter(Boolean);
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: "setup",
          subject: `Set up: ${title} [${feature}]`.slice(0, 160),
          message: lines.join("\n"),
          path: typeof window !== "undefined" ? window.location.pathname : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "We couldn't send that. Check your connection and try again.");
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't send that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className={cx("flex items-start gap-3 rounded-[22px] bg-app-success-tint p-5", className)} role="status">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-app-success text-white"><Icon name="check" size={20} /></span>
        <div className="min-w-0 text-[15px] leading-[1.5]">
          <div className="text-[17px] font-extrabold">Thanks, we&apos;ve got it.</div>
          <p className="mb-0 mt-1">
            Someone from the Shopinbos team will {whatsapp.trim() ? "message you on WhatsApp" : "reply in Help"} within one working day and set it up with you. You don&apos;t need to do anything else.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={cx("rounded-[22px] border border-app-line bg-white p-5 sm:p-6", className)} aria-labelledby={`${id}-title`}>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-app-mint text-app-ink"><Icon name="chat" size={20} /></span>
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="m-0 text-[18px] font-extrabold leading-tight">{title}</h2>
          <p className="mb-0 mt-1 text-[15px] leading-[1.5] text-app-ink-soft">{description}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        {softwareQuestion && (
          <div>
            <FieldLabel htmlFor={`${id}-software`}>{softwareQuestion} <span className="font-normal text-app-ink-soft">(optional)</span></FieldLabel>
            <TextInput id={`${id}-software`} value={software} onChange={(e) => setSoftware(e.target.value)} placeholder={softwarePlaceholder} maxLength={120} />
          </div>
        )}
        <div>
          <FieldLabel htmlFor={`${id}-whatsapp`}>Your WhatsApp number <span className="font-normal text-app-ink-soft">(optional)</span></FieldLabel>
          <TextInput id={`${id}-whatsapp`} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="0803 123 4567" inputMode="tel" autoComplete="tel" maxLength={20} />
        </div>
        <div>
          <FieldLabel htmlFor={`${id}-details`}>Anything we should know? <span className="font-normal text-app-ink-soft">(optional)</span></FieldLabel>
          <textarea
            id={`${id}-details`}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={3}
            maxLength={1500}
            className="w-full rounded-[16px] border border-app-line bg-white px-4 py-3 text-[16px] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink"
          />
        </div>
      </div>

      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}

      <PillButton type="submit" tone="ink" size="lg" busy={busy} className="mt-5 w-full">
        Ask the team to set it up
      </PillButton>
    </form>
  );
}
