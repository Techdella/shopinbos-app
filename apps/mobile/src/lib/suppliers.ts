import { api } from "./api";

// Suppliers in the phone app (web /marketplace/suppliers and /marketplace/suppliers/<slug>): every supplier, near
// or far, nearest first (/api/mobile/suppliers), one supplier (/api/mobile/suppliers/<slug>; their products come from
// fetchFindProducts(q, { supplier })) and "Notify me when they add products" (/api/app/suppliers/<slug>/notify-me:
// follows them, and the supplier hears this shop is waiting).

export interface DirectorySupplier {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  city: string;
  country: string;
  businessType: string;
  categories: string[];
  km: number | null;
  near: boolean;
  verificationStatus: string;
  risk: { score: number; level: "low" | "medium" | "high" } | null;
  products: number;
  following: boolean;
}

export async function fetchSuppliers(q?: string) {
  const params = new URLSearchParams();
  if (q?.trim()) params.set("q", q.trim().slice(0, 120));
  return api<{ hasPlace: boolean; suppliers: DirectorySupplier[] }>(`/api/mobile/suppliers${params.toString() ? `?${params.toString()}` : ""}`);
}

export const fetchSupplier = (slug: string) => api<DirectorySupplier>(`/api/mobile/suppliers/${encodeURIComponent(slug)}`);

/** on: notify me (and tell the supplier); off: stop. */
export const setNotifyMe = (slug: string, on: boolean) =>
  api<{ following: boolean; waiting?: number }>(`/api/app/suppliers/${encodeURIComponent(slug)}/notify-me`, { method: on ? "POST" : "DELETE" });
