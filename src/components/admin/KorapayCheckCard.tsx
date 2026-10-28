"use client";

import { useState } from "react";
import { Card, CardHead, Pill } from "@/components/app-kit";
import { Notice, PillButton } from "@/components/app-ui";
import { friendlyError } from "@/lib/errors/report-client";
import type { KorapayCheck } from "@/lib/kyb/korapay-check.server";

// Admin › Developers: "Test Korapay Identity" runs one real CAC lookup (paid from the Korapay balance) and shows
// Korapay's own answer, so a failing partner CAC, NIN or selfie check can be traced to its cause.

/** What to do about Korapay's answer, in plain words. */
function advice(check: KorapayCheck): string {
  if (!check.configured) return "KORAPAY_SECRET_KEY isn't set in Vercel, so ID, selfie and CAC checks can't use Korapay.";
  if (check.health.state === "key_rejected") return "Korapay rejected the secret key. Copy the live secret key again from the Korapay dashboard into KORAPAY_SECRET_KEY, then redeploy.";
  if (check.health.state === "unreachable") return "Korapay couldn't be reached from the server. Try again in a minute.";
  const cac = check.cac;
  if (!cac) return "";
  if (cac.ok) {
    const first = check.attempts[0];
    return first && !first.ok
      ? `Korapay Identity works, but only with "${check.attempts.at(-1)?.label}". Send this to the developer so CAC checks use that shape.`
      : "Korapay Identity works: CAC, NIN and selfie checks can run.";
  }
  if (check.health.state === "ok" && check.health.balance === 0) return "The Korapay NGN balance is ₦0. Each ID, selfie and CAC check is paid from it, and Korapay may refuse checks until it's topped up. Top it up, then test again; if it still fails, send Korapay support the answers above.";
  const message = cac.message.toLowerCase();
  if (cac.httpStatus === 401 || cac.httpStatus === 403 || /not enabled|permission|access|activate/.test(message)) return "Identity isn't switched on for this Korapay account. In the Korapay dashboard, request access to Identity (including facial matching for selfies), then test again.";
  if (cac.httpStatus === 402 || /balance|insufficient|fund/.test(message)) return "The Korapay NGN balance is too low. Each ID, selfie and CAC check is paid from it: top it up, then test again.";
  return "Korapay refused the lookup. The message above is Korapay's own; send it to Korapay support if it isn't clear.";
}

export function KorapayCheckCard() {
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<KorapayCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/korapay-check", { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "The test couldn't run.");
      setCheck(json.data);
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err) : "The test couldn't run.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4 p-5">
      <CardHead title="Test Korapay Identity" sub="Runs a real CAC lookup (only a lookup that works is paid from the Korapay balance) and shows Korapay's own answer to each request shape tried." />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <PillButton size="md" busy={busy} onClick={() => void run()}>Test Korapay Identity</PillButton>
      </div>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      {check && (
        <div className="mt-4 grid gap-2 text-[13.5px] leading-[1.5]">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={check.configured ? "success" : "danger"} dot>{check.configured ? "Secret key set" : "Secret key missing"}</Pill>
            {check.health.state === "ok" && <Pill tone={check.health.environment === "live" ? "success" : "warning"} dot>{check.health.environment === "live" ? "Live key" : "Test key"}</Pill>}
            {check.health.state === "ok" && check.health.balance !== null && <Pill tone="muted">Balance ₦{check.health.balance.toLocaleString("en-NG")}</Pill>}
            <Pill tone={check.livenessKey ? "success" : "warning"} dot>{check.livenessKey ? "Liveness public key set" : "Liveness public key not set"}</Pill>
          </div>
          {check.attempts.map((attempt) => (
            <div key={attempt.label} className="rounded-[14px] border border-app-line px-3.5 py-3">
              <div className="font-extrabold">{attempt.label}: {attempt.ok ? "worked" : "failed"} (HTTP {attempt.httpStatus || "none"})</div>
              <div className="font-mono text-[12px] text-app-ink-soft">{JSON.stringify(attempt.body)}</div>
              {attempt.ok && check.cac?.companyName && <div>Found: {check.cac.companyName}</div>}
              {attempt.message && <div className="text-app-ink-soft">Korapay said: “{attempt.message}”</div>}
              {attempt.details && <div className="font-mono text-[12px] text-app-ink-soft">Details: {attempt.details}</div>}
            </div>
          ))}
          <p className="m-0 font-bold">{advice(check)}</p>
        </div>
      )}
    </Card>
  );
}
