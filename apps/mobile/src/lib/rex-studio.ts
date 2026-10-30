import { api } from "./api";
import type { RexStudioMeterState } from "@shared/rex-studio-welcome";

// "You have 20 credits to try Rex Studio" (shared/rex-studio-welcome.ts): a free seller's credits after Rex built
// their shop. GET /api/app/rex-studio → { welcome } (null: the card doesn't show). Nothing here is ever sold: when the
// credits run low the card only says the plan's credits refill each month (shared/store-payments.ts).

export interface RexStudioWelcome {
  granted: number;
  balance: number;
  target: number;
  percent: number;
  state: RexStudioMeterState;
  expiresAt: string | null;
  product: string | null;
  costs: { photo: number; video: number; image: number };
}

export const fetchRexStudioWelcome = () =>
  api<{ welcome: RexStudioWelcome | null }>("/api/app/rex-studio")
    .then((data) => data.welcome ?? null)
    .catch(() => null);
