"use client";

import { useEffect, useState } from "react";
import { buttonClass } from "@/components/growth/kit";
import { useT } from "@/components/i18n/I18nProvider";
import { PlatformLogo } from "@/components/channels/PlatformLogo";
import { EmbeddedSignupError, preloadFacebookSdk, runEmbeddedSignup } from "@/components/meta/embedded-signup";

// The phone app's "Connect WhatsApp" (page.tsx): one button that runs Meta's Embedded Signup (Facebook's popup needs
// a tap to open), saves the number with POST /api/app/inbox/whatsapp like the web's WhatsApp card, then goes back
// into the app. The catalog and the WhatsApp store set themselves up on the server, as on the web.

export function WhatsAppAppConnect({ signup, links }: { signup: { appId: string; configId: string }; links: { connected: string; closed: string } }) {
  const t = useT("social");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Facebook's SDK loads now, so the tap opens Facebook's window at once (a late window is blocked as a popup).
  useEffect(() => {
    preloadFacebookSdk(signup.appId);
  }, [signup.appId]);

  async function connect() {
    setBusy(true);
    setProblem(null);
    try {
      const info = await runEmbeddedSignup(signup);
      const res = await fetch("/api/app/inbox/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "embedded_signup", ...info }), signal: AbortSignal.timeout(90_000) });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message || t("card.waFailed"));
      }
      window.location.replace(links.connected);
    } catch (caught) {
      setBusy(false);
      // Closing Facebook's window isn't a problem worth a red line: they can tap again or go back.
      if (caught instanceof EmbeddedSignupError && caught.code === "closed") return;
      setProblem(caught instanceof EmbeddedSignupError ? (caught.code === "sdk" || caught.code === "blocked" || caught.code === "timeout" ? caught.message : t("card.waFailed")) : caught instanceof Error ? caught.message : t("card.waFailed"));
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-app-canvas px-4 py-8 font-app text-app-ink">
      <div className="w-full max-w-[400px] text-center">
        <PlatformLogo platform="whatsapp" size={64} className="mx-auto" />
        <h1 className="mb-2 mt-5 text-[26px] font-extrabold tracking-[-0.4px]">{t("appWa.title")}</h1>
        <p className="m-0 text-[15px] leading-[22px] text-app-ink-soft">{t("appWa.body")}</p>
        <ol className="mx-auto mb-0 mt-5 grid max-w-[340px] gap-2 p-0 text-left text-[14px] leading-[20px]">
          {(["appWa.step1", "appWa.step2", "appWa.step3"] as const).map((key, index) => (
            <li key={key} className="flex items-start gap-3 rounded-[14px] border border-app-line bg-white px-3 py-2.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-app-mint text-[12.5px] font-extrabold">{index + 1}</span>
              <span>{t(key)}</span>
            </li>
          ))}
        </ol>
        {problem ? (
          <p role="alert" className="mb-0 mt-4 rounded-[14px] bg-app-danger-tint px-4 py-3 text-[14px] text-app-danger">
            {problem}
          </p>
        ) : null}
        <button type="button" onClick={() => void connect()} disabled={busy} className={buttonClass("ink", "md", "mt-6 w-full")}>
          {busy ? t("card.connecting") : problem ? t("card.tryAgain") : t("appWa.continue")}
        </button>
        <a href={links.closed} className="mt-3 inline-flex min-h-[44px] items-center justify-center px-4 text-[14px] font-bold text-app-ink-soft underline">
          {t("appBack.button")}
        </a>
      </div>
    </main>
  );
}
