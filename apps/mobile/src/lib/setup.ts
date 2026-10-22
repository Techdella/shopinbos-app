import { api } from "./api";

// The "Start here" checklist: GET / PATCH /api/app/setup (src/lib/setup on the web side works it out from the
// real state of the shop, so "done" here always matches the web page /home/start).

export type SetupStepKey = "store" | "look" | "products" | "payments" | "delivery" | "partners" | "payout" | "live" | "socials" | "share" | "domain" | "audience";

export interface SetupStep {
  key: SetupStepKey;
  title: string;
  hint: string;
  optional: boolean;
  done: boolean;
  skipped: boolean;
  action: { kind: "inline"; label: string } | { kind: "link"; label: string; href: string };
  helper: { who: "peggy" | "rex"; prompt: string } | null;
}

export interface SetupOverview {
  store: { id: string; name: string; slug: string; logoUrl: string | null; url: string | null };
  checklist: {
    steps: SetupStep[];
    done: number;
    total: number;
    percent: number;
    complete: boolean;
    showStart: boolean;
    next: SetupStep | null;
  };
}

export type SetupPatch = { type: "skip" | "unskip"; key: SetupStepKey } | { type: "dismiss" | "reopen" | "shared" };

export const fetchSetup = () => api<SetupOverview>("/api/app/setup");

export const patchSetup = (patch: SetupPatch) => api<SetupOverview>("/api/app/setup", { method: "PATCH", json: patch });
