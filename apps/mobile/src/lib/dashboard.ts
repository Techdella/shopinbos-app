import { api } from "./api";

// GET /api/app/dashboard (src/lib/dashboard on the web side builds it).

export type Tone = "accent" | "success" | "warning" | "muted" | "danger";

export interface OrderRow {
  id: string;
  orderNumber: string;
  buyer: string;
  summary: string;
  image: string | null;
  stage: { label: string; tone: Tone };
  payment: { label: string; tone: Tone };
  total: number;
}

export interface Dashboard {
  store: { id: string; name: string; slug: string; logoUrl: string | null; url: string | null; live: boolean };
  ownerName: string;
  /** The person's profile photo, the same as the web's top bar (missing from older servers). */
  ownerAvatarUrl?: string | null;
  sales: { today: number; week: number; weekChange: number | null };
  counts: { ordersToday: number; visitorsToday: number; chatsToday: number };
  tasks: Array<{ key: string; icon: "chat" | "mail" | "truck" | "box" | "coin"; title: string; hint: string; href: string; image?: string | null; action?: { label: string; href: string } }>;
  daily: { data: number[]; labels: string[] };
  latestOrders: OrderRow[];
  sources: Array<{ channel: string; label: string; count: number; share: number }>;
  sellingFast: Array<{ id: string; name: string; image: string | null; price: number; sold: number; stock: { label: string; low: boolean } }>;
  imports: Array<{ id: string; quantity: number; product: string; supplier: string }>;
  checklist: Array<{ key: string; label: string; hint: string; href: string; done: boolean; manual: boolean }>;
}

export const fetchDashboard = (init: { signal?: AbortSignal } = {}) => api<Dashboard>("/api/app/dashboard", init);

export const fetchOrders = (status?: string) =>
  api<Array<{ id: string; createdAt: string; row: OrderRow }>>(`/api/app/orders?limit=50${status ? `&status=${status}` : ""}`);

export interface ProductItem {
  id: string;
  name: string;
  images: string[];
  retailPrice: number;
  currentStock: number;
  status: string;
  category?: { id: string; name: string } | null;
}

/** The newest 50 products, or the newest 50 in one category. */
export const fetchProducts = (categoryId?: string) =>
  api<ProductItem[]>(`/api/store/products?limit=50&sort=newest${categoryId ? `&categoryId=${encodeURIComponent(categoryId)}` : ""}`);

export const TONE_COLORS: Record<Tone, { bg: string; fg: string }> = {
  accent: { bg: "#FFEDE4", fg: "#B23E0A" },
  success: { bg: "#E2F5EA", fg: "#16794A" },
  warning: { bg: "#FDF0D5", fg: "#8A5A00" },
  muted: { bg: "#F6F5F9", fg: "#6B6779" },
  danger: { bg: "#FDECEA", fg: "#B42318" },
};
