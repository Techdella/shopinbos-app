import { api } from "./api";
import type { DomainState, ServeAs, VerifyCheck } from "./domain-pure";

export * from "./domain-pure";

// Web address (app/domain.tsx): the free <slug>.mybos.store address and the seller's own domain. One read
// (GET /api/mobile/domain), then the web's own routes: POST/DELETE /api/domains/connect claims or removes a domain,
// POST /api/domains/verify checks the TXT record. Buying a new domain is a paid checkout and stays on the website.

export interface DomainOverview {
  free: { url: string; host: string; live: boolean };
  own: DomainState;
  canBuy: boolean;
}

export const fetchDomain = () => api<DomainOverview>("/api/mobile/domain");

export const claimDomain = (domain: string, serveAs: ServeAs) => api<DomainState>("/api/domains/connect", { method: "POST", json: { domain, serveAs } });

export const verifyDomain = () => api<{ state: DomainState; check: VerifyCheck }>("/api/domains/verify", { method: "POST" });

export const removeDomain = (which: "live" | "pending") => api<DomainState>("/api/domains/connect", { method: "DELETE", json: { which } });
