import type { LabelShop, ShippingLabel } from "./label-pure";
import { API_URL, api } from "./api";

// Shipping labels (web /home/labels): GET /api/app/labels?orders=<id> → the label to preview and a short-lived
// print token; /api/app/labels/print?token=… is the printable page the in-app browser opens.

export interface LabelsAnswer {
  shop: LabelShop;
  labels: ShippingLabel[];
  printToken: string | null;
  expiresInSeconds: number;
}

export const fetchLabels = (orderIds: string[]) => api<LabelsAnswer>(`/api/app/labels?orders=${encodeURIComponent(orderIds.join(","))}`);

export function printUrl(token: string, format: "label" | "a4", lang: string) {
  return `${API_URL}/api/app/labels/print?${new URLSearchParams({ token, format, lang }).toString()}`;
}
