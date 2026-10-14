"use client";

import { Pill, type Tone } from "@/components/app-kit";
import { selectClass } from "@/components/growth/kit";
import {
  TEMPLATE_VARIABLES,
  TEMPLATE_VARIABLE_KEYS,
  estimateSmsCost,
  fillTemplateVariables,
  renderTemplateText,
  smsSegments,
  variableCount,
  type TemplateContent,
  type TemplateVariable,
} from "@/lib/marketing/text-channels";
import { DETAIL_LABEL } from "./friendly";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatMoney, formatNumber } from "@shared/i18n";

// Client pieces for SMS and WhatsApp: the SMS segment counter, WhatsApp template status pills (plain words), the
// mapper for what fills each {{1}}..{{n}} ("Customer detail 1 is …"), and a WhatsApp-style preview bubble.

export interface TemplateOption {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  rejectedReason: string | null;
  content: TemplateContent;
  variables: string[];
  preset?: string | null;
}

export const TEMPLATE_STATUS: Record<string, { tone: Tone; label: string }> = {
  DRAFT: { tone: "muted", label: "Not sent to WhatsApp yet" },
  PENDING: { tone: "info", label: "Waiting for WhatsApp to approve (usually a few minutes)" },
  IN_APPEAL: { tone: "info", label: "WhatsApp is looking at it again" },
  APPROVED: { tone: "success", label: "Approved" },
  REJECTED: { tone: "danger", label: "WhatsApp said no" },
  PAUSED: { tone: "warning", label: "Paused by WhatsApp" },
  DISABLED: { tone: "danger", label: "Turned off by WhatsApp" },
  LOCAL_ERROR: { tone: "danger", label: "Didn't reach WhatsApp: try again" },
};

/** The status words above in the person's language (English from TEMPLATE_STATUS when a status is unknown). */
export function useTemplateStatusLabel() {
  const t = useT("emailBuilder");
  return (status: string) => {
    const s = TEMPLATE_STATUS[status];
    return s ? t.dynamic(`templateStatus.${status}`, s.label) : status.toLowerCase();
  };
}

export function TemplateStatusPill({ status }: { status: string }) {
  const label = useTemplateStatusLabel();
  return <Pill tone={TEMPLATE_STATUS[status]?.tone ?? "muted"}>{label(status)}</Pill>;
}

/** Chip/select label for a customer detail, in the person's language. */
export function useDetailLabel() {
  const t = useT("emailBuilder");
  return (key: string) => t.dynamic(`detail.${key}`, DETAIL_LABEL[key as keyof typeof DETAIL_LABEL] ?? key);
}

/** Characters, encoding, parts per person and (when the price is known) the cost of the send. */
export function SmsCounter({ text, recipients, costPerSegment, currency }: { text: string; recipients?: number | null; costPerSegment?: number | null; currency?: string }) {
  const t = useT("emailBuilder");
  const locale = useLocale();
  const count = smsSegments(text);
  const cost = recipients != null ? estimateSmsCost(count.segments, recipients, costPerSegment) : null;
  return (
    <div className="grid gap-1 text-[12.5px] text-app-ink-soft" aria-live="polite">
      <p className="m-0">
        <strong className="text-app-ink">{count.segments}</strong> {t("sms.partsPerPerson", { count: count.segments })} · {t("sms.letters", { used: count.units, of: count.segments > 1 ? `${count.segments} × ${count.perSegment}` : String(count.perSegment) })} · {t("sms.left", { count: count.remaining })}
        {cost != null && recipients ? (
          <>
            {" "}· {t("sms.about")} <strong className="text-app-ink">{formatMoney(cost, locale, { currency: currency ?? "NGN", decimals: 2 })}</strong> {t("sms.forPeople", { count: recipients, people: formatNumber(recipients, locale) })}
          </>
        ) : null}
      </p>
      {count.unicodeChars.length ? (
        <p className="m-0 text-app-accent-ink">
          {t("sms.unicode", { chars: count.unicodeChars.slice(0, 6).join(" "), count: count.unicodeChars.length })}
        </p>
      ) : null}
    </div>
  );
}

/** One select per {{n}}: what fills it. */
export function VariableMapper({ template, value, onChange }: { template: TemplateOption; value: string[]; onChange: (next: string[]) => void }) {
  const t = useT("emailBuilder");
  const detailLabel = useDetailLabel();
  const count = variableCount(template.content);
  if (!count) return <p className="m-0 text-[13px] text-app-ink-soft">{t("vars.none")}</p>;
  const mapping = value.some(Boolean) ? value : template.variables;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {Array.from({ length: count }, (_, i) => (
        <label key={i} className="grid gap-1 text-[13px] font-bold">
          <span>{t("vars.detailIs", { n: i + 1 })}</span>
          <select
            className={selectClass}
            value={mapping[i] ?? ""}
            onChange={(e) => {
              const next = Array.from({ length: count }, (_, j) => mapping[j] ?? "");
              next[i] = e.target.value;
              onChange(next);
            }}
          >
            <option value="">{t("vars.choose")}</option>
            {TEMPLATE_VARIABLE_KEYS.map((key) => (
              <option key={key} value={key}>{detailLabel(key)}</option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

/** The message as the customer sees it on WhatsApp, with sample values. */
export function WhatsAppBubble({ content, mapping, values, headerImageUrl }: { content: TemplateContent; mapping: string[]; values?: Partial<Record<TemplateVariable, string>>; headerImageUrl?: string | null }) {
  const t = useT("emailBuilder");
  const samples = Object.fromEntries(TEMPLATE_VARIABLE_KEYS.map((key) => [key, TEMPLATE_VARIABLES[key].sample])) as Record<TemplateVariable, string>;
  const { params } = fillTemplateVariables(mapping, variableCount(content), { ...samples, ...values });
  const text = renderTemplateText({ ...content, header: content.header.format === "TEXT" ? content.header : { format: "NONE" } }, params);
  return (
    <div className="rounded-[18px] bg-[#EFEAE2] p-3">
      <div className="max-w-[320px] overflow-hidden rounded-[12px] bg-white shadow-sm">
        {content.header.format === "IMAGE" ? (
          headerImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={headerImageUrl} alt="" className="block h-[150px] w-full object-cover" />
          ) : (
            <div className="grid h-[120px] place-items-center bg-app-canvas text-[12.5px] text-app-ink-soft">{t("bubble.picture")}</div>
          )
        ) : null}
        <p className="m-0 whitespace-pre-wrap break-words px-3 py-2.5 text-[14px] leading-[1.45]">{text || t("bubble.empty")}</p>
        {content.buttons.length ? (
          <div className="border-t border-app-line">
            {content.buttons.map((b, i) => (
              <p key={i} className="m-0 border-b border-app-line px-3 py-2 text-center text-[13.5px] font-semibold text-[#027EB5] last:border-b-0">{b.text}</p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Where to go when a channel isn't ready. */
export function ChannelHelp({ label, howTo, href, linkLabel }: { label: string; howTo: string; href: string | null; linkLabel: string | null }) {
  const t = useT("emailBuilder");
  return (
    <span>
      <strong>{label}:</strong> {howTo}{" "}
      {href ? (
        <a href={href} className="font-bold text-app-accent-ink underline">
          {linkLabel ?? t("channelHelp.setUp")}
        </a>
      ) : null}
    </span>
  );
}
