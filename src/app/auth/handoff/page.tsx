"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { handoffNextPath, readHandoffToken } from "@/lib/auth/handoff";
import { APP_SESSION_COOKIE, APP_SESSION_MAX_AGE } from "@/lib/app-session";
import { useT } from "@/components/i18n/I18nProvider";

// The mobile app opens web-only tools through here so the seller isn't asked to log in again.
// The app puts its current access token in the URL fragment (never sent to a server or in Referer).
// We only borrow the access token: the app keeps its refresh token, because Supabase rotates refresh
// tokens and sharing one would sign one side out. The web session lasts until that token expires
// (up to an hour), and every "open on the web" from the app starts a fresh one.

const BORROWED_REFRESH_TOKEN = "app-handoff";

export default function HandoffPage() {
  const t = useT("auth");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const next = handoffNextPath(new URLSearchParams(window.location.search).get("next"));
    const token = readHandoffToken(window.location.hash);
    // Drop the token from the address bar and history straight away.
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);

    // Only the phone app comes through here: mark the session so purchase screens hide (src/lib/app-session.ts).
    document.cookie = `${APP_SESSION_COOKIE}=1; Max-Age=${APP_SESSION_MAX_AGE}; Path=/; SameSite=Lax; Secure`;

    const supabase = getSupabaseBrowserClient();
    if (!token || !supabase) {
      window.location.replace(next);
      return;
    }
    supabase.auth
      .setSession({ access_token: token, refresh_token: BORROWED_REFRESH_TOKEN })
      .then(({ error }) => {
        if (error) setFailed(true);
        window.location.replace(next);
      })
      .catch(() => window.location.replace(next));
  }, []);

  return (
    <main className="grid min-h-dvh place-items-center bg-app-canvas px-6 font-app text-app-ink">
      <div className="text-center">
        <div className="mx-auto h-9 w-9 animate-spin rounded-full border-[3px] border-app-line border-t-app-accent" aria-hidden />
        <p className="mt-4 text-[15px] font-semibold" role="status">{failed ? t("handoff.failed") : t("handoff.opening")}</p>
      </div>
    </main>
  );
}
