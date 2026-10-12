import { api } from "./api";

// Dropship products: GET /api/mobile/dropship, pause or sell again with POST { relationshipId, pause }.

export interface DropshipItem {
  id: string;
  paused: boolean;
  live: boolean;
  product: { id: string; name: string; status: string };
  image: string | null;
  supplier: { id: string; userId: string; name: string; city: string | null };
  ships: string;
  stock: number;
  sale: { shopperPays: number; supplierGets: number; fee: number; keep: number; keepPct: number };
}

export function fetchDropship() {
  return api<DropshipItem[]>("/api/mobile/dropship");
}

export function setPaused(relationshipId: string, pause: boolean) {
  return api<{ status: "active" | "paused" }>("/api/mobile/dropship", { method: "POST", json: { relationshipId, pause } });
}

export type DropshipFilter = "all" | "selling" | "paused" | "attention";

export function filterDropship(items: DropshipItem[], filter: DropshipFilter) {
  if (filter === "selling") return items.filter((item) => item.live);
  if (filter === "paused") return items.filter((item) => item.paused);
  if (filter === "attention") return items.filter((item) => item.stock < 5);
  return items;
}
