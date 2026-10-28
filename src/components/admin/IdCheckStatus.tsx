import { Card, Pill, type Tone } from "@/components/app-kit";
import type { YouverifyHealth } from "@/lib/youverify";
import type { KorapayIdentityHealth } from "@/lib/korapay";

// The ID (BVN/NIN) and CAC check services' setup, for Admin › Developers. Wallets only shows whether they work.

export const CAC_PROVIDER_NAMES = { cac: "CAC's own VAS API", korapay: "Korapay Identity", youverify: "Youverify", dojah: "Dojah" } as const;

/**
 * Which CAC lookups the instant CAC check (suppliers and delivery partners) can use, in the order it tries them. A
 * provider that refuses (no balance, not enabled, key rejected) hands over to the next; when they all refuse, people
 * are asked to upload their certificate and the reason is in the Vercel logs as "[kyb/cac]".
 */
export function CacChecksStatus({ providers }: { providers: Array<keyof typeof CAC_PROVIDER_NAMES> }) {
  return (
    <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
      <Pill tone={providers.length ? "success" : "danger"} dot>{providers.length ? "CAC checks: on" : "CAC checks: off"}</Pill>
      <span className="min-w-0 flex-1 basis-[280px] text-[13.5px] leading-[1.45]">
        {providers.length
          ? providers.length === 1 && providers[0] === "korapay"
            ? "Korapay Identity runs every CAC check (no fallback). If checks fail, use Test Korapay Identity below to see Korapay's own answer."
            : `Tried in this order: ${providers.map((name) => CAC_PROVIDER_NAMES[name]).join(", then ")}. One that refuses (no balance, service not enabled) hands over to the next.`
          : "No CAC lookup is set up, so suppliers and delivery partners must upload their certificate. Add CAC_VAS_API_KEY (vas.cac.gov.ng) in Vercel, then redeploy."}
        <span className="block text-[12.5px] text-app-ink-soft">If checks fail, search the Vercel logs for "[kyb/cac]" to see each provider's answer.</span>
      </span>
    </Card>
  );
}

/** Whether Korapay Identity's key works and what's in the balance the checks are paid from, so the team can fix the setup. */
export function KorapayChecksStatus({ health }: { health: KorapayIdentityHealth }) {
  const words: Record<KorapayIdentityHealth["state"], { tone: Tone; text: string }> = {
    ok: { tone: "success", text: "Korapay Identity runs the ID (BVN/NIN) and CAC checks. Each live check is paid from the Korapay NGN balance. If checks still fail, make sure Identity is enabled in the Korapay dashboard (Identity → request access)." },
    not_set: { tone: "danger", text: "No ID checks are set up: add KORAPAY_SECRET_KEY in Vercel, then redeploy." },
    key_rejected: { tone: "danger", text: "Korapay rejects the key. Copy the secret key again from the Korapay dashboard (Settings → API Configuration), update KORAPAY_SECRET_KEY in Vercel and redeploy." },
    unreachable: { tone: "warning", text: "Korapay couldn't be reached just now. Refresh in a minute." },
    other: { tone: "warning", text: "Korapay answered with an unexpected error." },
  };
  const shown = words[health.state];
  const naira = health.state === "ok" && health.balance !== null ? `₦${health.balance.toLocaleString("en-NG", { maximumFractionDigits: 2 })}` : null;
  const detail = health.state === "ok" ? (naira ? `Available balance: ${naira}` : "") : "status" in health || "message" in health ? [("status" in health && health.status) ? `HTTP ${health.status}` : "", "message" in health && health.message ? health.message : ""].filter(Boolean).join(" · ") : "";
  return (
    <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
      <Pill tone={health.state === "ok" && health.balance === 0 ? "warning" : shown.tone} dot>{health.state === "ok" ? `ID checks: Korapay (${health.environment})` : "ID checks"}</Pill>
      <span className="min-w-0 flex-1 basis-[280px] text-[13.5px] leading-[1.45]">
        {shown.text}
        {detail ? <span className="block text-[12.5px] text-app-ink-soft">{health.state === "ok" ? detail : `Korapay said: ${detail}`}</span> : null}
      </span>
    </Card>
  );
}

/** Why ID checks work or don't (Youverify answers a free request with the key), so the team can fix the setup. */
export function IdChecksStatus({ health }: { health: YouverifyHealth }) {
  const words: Record<YouverifyHealth["state"], { tone: Tone; text: string }> = {
    ok: { tone: "success", text: "Youverify is connected. ID and CAC checks run through it." },
    not_set: { tone: "danger", text: "No ID checks are set up: add KORAPAY_SECRET_KEY in Vercel (Korapay Identity runs ID and CAC checks), then redeploy. Until then people see “ID checks are being switched on”." },
    key_rejected: { tone: "danger", text: "Youverify rejects the key (401) on both sandbox and live. Copy the secret key again from cowork.youverify.co → Settings → API Keys (not the public merchant key), update YOUVERIFY_SECRET_KEY in Vercel and redeploy." },
    no_balance: { tone: "danger", text: "Youverify says the account has no funds (402). Top up the Youverify wallet or plan." },
    plan_limit: { tone: "danger", text: "Youverify refuses on plan grounds (403). Ask Youverify to enable NIN, BVN and business checks for this account." },
    unreachable: { tone: "warning", text: "Youverify couldn't be reached just now. Refresh in a minute." },
    other: { tone: "warning", text: "Youverify answered with an unexpected error." },
  };
  const shown = words[health.state];
  const detail = "status" in health || "message" in health ? [("status" in health && health.status) ? `HTTP ${health.status}` : "", "message" in health && health.message ? health.message : ""].filter(Boolean).join(" · ") : "";
  return (
    <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
      <Pill tone={shown.tone} dot>{health.state === "ok" ? `ID checks: on (${health.environment})` : "ID checks"}</Pill>
      <span className="min-w-0 flex-1 basis-[280px] text-[13.5px] leading-[1.45]">
        {shown.text}
        {detail ? <span className="block text-[12.5px] text-app-ink-soft">Youverify said: {detail}</span> : null}
      </span>
    </Card>
  );
}
