import { api, appHeaders } from "./api";
import type { BlastChannel, FollowerBlastKind } from "@shared/follower-blasts";

// Notify my followers on the phone (web /home/marketing/followers): GET/POST /api/app/marketing/followers, Rex's draft
// and the WhatsApp template set-up. The pilot switch is checked on the server per app, so the app headers go along.

export interface BlastRow {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  channels: string[];
  audienceCount: number;
  sentCount: number;
  failedCount: number;
  status: "queued" | "sending" | "sent" | "failed" | string;
  createdAt: string;
  sentAt: string | null;
}

export interface FollowersOverview {
  followers: number;
  audience: { followers: number; whatsapp: number; email: number; push: number; reachable: number };
  reachBy: Record<string, number>;
  allowance: { cap: number; used: number; left: number; nextFreeAt: string | null };
  channels: {
    whatsapp: { ready: boolean; setup: "ready" | "connect" | "template_missing" | "template_pending" | "template_rejected"; howTo: string };
    email: { ready: boolean; howTo: string };
    push: { ready: boolean };
  };
  blasts: BlastRow[];
  storeName: string;
  storeLink: string;
  limits: { title: number; body: number };
  products: { id: string; name: string; imageUrl: string | null; url: string }[];
}

export const fetchFollowers = () => api<FollowersOverview>("/api/app/marketing/followers", { headers: appHeaders() });

export const sendBlast = (input: { kind: FollowerBlastKind; title: string; body: string; productId: string | null; link: string | null; channels: BlastChannel[] }) =>
  api<{ blast: BlastRow }>("/api/app/marketing/followers", { method: "POST", json: input, headers: appHeaders() });

export const draftBlast = (input: { kind: FollowerBlastKind; productId: string | null; language: string }) =>
  api<{ ai: boolean; title: string; body: string }>("/api/app/marketing/followers/draft", { method: "POST", json: input, headers: appHeaders() });

export const setUpWhatsAppNews = () => api<{ status: string }>("/api/app/marketing/followers/whatsapp", { method: "POST", json: {}, headers: appHeaders() });
