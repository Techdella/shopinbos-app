import { api, API_URL } from "./api";
import { optional } from "./familiar";

// Shop looks (the web's theme library): GET /api/store/templates (every look), POST /api/store/templates/apply
// { templateId } (switch the shop's draft to it; a live shop keeps its look until it publishes) and POST
// /api/store/templates/recommend (Rex picks one for what the shop sells, or simple category rules without AI).

export interface ShopLook {
  id: string;
  name: string;
  category: string;
  description: string;
  previewImage: string | null;
  tags: string[];
  themeTokens: { heroBg: string; heroText: string; accent: string; ctaBg: string; ctaText: string; paperBg: string; ink: string; headingStyle: "serif" | "grotesk" };
}

/** A preview picture's full address (the server sends paths like "/templates/…"). */
export const lookImage = (path: string | null | undefined) => (!path ? null : /^https?:\/\//.test(path) ? path : `${API_URL}${path.startsWith("/") ? "" : "/"}${path}`);

export const fetchLooks = () => optional(api<{ templates: ShopLook[] }>("/api/store/templates"));

export const applyLook = (templateId: string) =>
  api<{ template: { templateId?: string; templateName?: string } | null; storeSlug: string; draftOnly: boolean }>("/api/store/templates/apply", { method: "POST", json: { templateId } });

export const recommendLook = () => optional(api<{ themeId: string; reason: string; source: "rex" | "rules"; note?: string }>("/api/store/templates/recommend", { method: "POST" }));
