// BroadcastCampaign.channelConfig: what an SMS or WhatsApp campaign needs beyond its text. Pure.

export interface CampaignChannelConfig {
  /** SMS: alphanumeric sender ID for this campaign (else the store's default, else the provider account's). */
  senderId?: string | null;
  /** WhatsApp: the approved WhatsAppTemplate id. */
  templateId?: string | null;
  /** WhatsApp: what fills {{1}}..{{n}} (keys of TEMPLATE_VARIABLES); empty uses the template's own mapping. */
  variables?: string[];
  /** WhatsApp: picture for an image-header template. */
  headerImageUrl?: string | null;
  /** WhatsApp: a product whose photo is the header and whose page is {{product_link}}. */
  productId?: string | null;
  /** WhatsApp: the code that fills {{discount_code}}. */
  discountCode?: string | null;
}

const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);

export function readChannelConfig(raw: unknown): CampaignChannelConfig {
  const c = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const image = text(c.headerImageUrl, 1000);
  return {
    senderId: text(c.senderId, 11),
    templateId: text(c.templateId, 64),
    variables: Array.isArray(c.variables) ? c.variables.map((v) => (typeof v === "string" ? v.slice(0, 40) : "")).slice(0, 20) : [],
    headerImageUrl: image && /^https:\/\/\S+$/.test(image) ? image : null,
    productId: text(c.productId, 64),
    discountCode: text(c.discountCode, 40),
  };
}
