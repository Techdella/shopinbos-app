import { api } from "./api";
import { EMAIL_AUDIENCES, popupBody, type EmailAudience, type InsightRange, type Insights, type PhonePopup } from "./grow-pure";

// The seller's grow screens and the server routes they use:
// Insights      GET  /api/mobile/insights?range=today|7d|30d (the web's analytics loader)
// Popups        GET  /api/mobile/marketing/popups; save with POST/PATCH /api/app/marketing/forms[/:id]
// Email         the list is GET /api/mobile/marketing (lib/marketing.ts fetchMarketing); Rex writes with
//               POST /api/mobile/marketing/email-draft; sending is POST /api/app/marketing/campaigns, then
//               POST /api/app/marketing/campaigns/:id { action: "send" | "schedule" }.

export const fetchInsights = (range: InsightRange) => api<Insights>(`/api/mobile/insights?range=${range}`);

export interface PopupsOverview {
  popups: PhonePopup[];
  blank: Omit<PhonePopup, "id" | "views" | "signups" | "rewardText">;
  totals: { views: number; signups: number };
}

export const fetchPopups = () => api<PopupsOverview>("/api/mobile/marketing/popups");

export const setPopupActive = (id: string, active: boolean) => api(`/api/app/marketing/forms/${encodeURIComponent(id)}`, { method: "PATCH", json: { active } });

export function savePopup(popup: Parameters<typeof popupBody>[0] & { id?: string | null }) {
  const body = popupBody(popup);
  return popup.id ? api<{ id: string }>(`/api/app/marketing/forms/${encodeURIComponent(popup.id)}`, { method: "PATCH", json: body }) : api<{ id: string }>("/api/app/marketing/forms", { method: "POST", json: body });
}

export const deletePopup = (id: string) => api(`/api/app/marketing/forms/${encodeURIComponent(id)}`, { method: "DELETE" });

export interface EmailDraft {
  subject: string;
  preheader: string;
  bodyHtml: string;
  note: string;
  ai: boolean;
}

export const draftEmail = (instruction: string, current?: Pick<EmailDraft, "subject" | "preheader" | "bodyHtml"> | null) =>
  api<EmailDraft>("/api/mobile/marketing/email-draft", { method: "POST", json: { instruction, current: current ?? null } });

export const audienceCount = (audience: EmailAudience) =>
  api<{ count: number }>("/api/app/marketing/campaigns/audience", { method: "POST", json: { channel: "email", audience: EMAIL_AUDIENCES[audience] } });

/** Saves the email as a campaign, then sends it now or schedules it (Lagos time "YYYY-MM-DDTHH:mm"). */
export async function sendEmail(input: { name: string; draft: Pick<EmailDraft, "subject" | "preheader" | "bodyHtml">; audience: EmailAudience; when: "now" | { at: string } }) {
  const campaign = await api<{ id: string }>("/api/app/marketing/campaigns", {
    method: "POST",
    json: { name: input.name, channel: "email", subject: input.draft.subject, preheader: input.draft.preheader || null, bodyHtml: input.draft.bodyHtml, audience: EMAIL_AUDIENCES[input.audience] },
  });
  const path = `/api/app/marketing/campaigns/${encodeURIComponent(campaign.id)}`;
  if (input.when === "now") await api(path, { method: "POST", json: { action: "send" } });
  else await api(path, { method: "POST", json: { action: "schedule", scheduledAt: input.when.at } });
  return campaign;
}

/** Keeps it as a draft (the Drafts tab). */
export const saveEmailDraft = (input: { name: string; draft: Pick<EmailDraft, "subject" | "preheader" | "bodyHtml">; audience: EmailAudience }) =>
  api<{ id: string }>("/api/app/marketing/campaigns", {
    method: "POST",
    json: { name: input.name, channel: "email", subject: input.draft.subject, preheader: input.draft.preheader || null, bodyHtml: input.draft.bodyHtml, audience: EMAIL_AUDIENCES[input.audience] },
  });
