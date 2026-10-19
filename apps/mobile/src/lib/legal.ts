import { api } from "./api";

// One legal page as plain text (web /home/legal/[key] edits the rich document): /api/app/legal/<key>/text, and
// Peggy's draft from /api/app/legal/<key>/draft. Saving goes through the same rules as the web.

export interface LegalText {
  key: string;
  title: string;
  text: string;
  /** False when the page has a video, button or product on it: its words are edited on the web. */
  textEditable: boolean;
  published: boolean;
  status: "published" | "draft" | "empty";
  updatedAt: string | null;
  standard: boolean;
  /** The page on the shop. */
  url: string;
}

const path = (key: string) => `/api/app/legal/${encodeURIComponent(key)}`;

export const fetchLegalText = (key: string) => api<LegalText>(`${path(key)}/text`);

/** Leave text out to keep the page's words as they are (e.g. to publish or unpublish). */
export const saveLegalText = (key: string, body: { title: string; text?: string; published: boolean }) =>
  api<LegalText>(`${path(key)}/text`, { method: "PUT", json: body });

export const draftLegalText = (key: string, body: { title: string; brief: string }) =>
  api<{ text: string; source: "ai" | "template" }>(`${path(key)}/draft`, { method: "POST", json: body });

/** Publishing needs words on the page (the server checks too). */
export function canPublish(text: string) {
  return text.trim().length > 0;
}
