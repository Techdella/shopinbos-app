// WhatsApp Embedded Signup in the browser (Facebook Login for Business, META_CONFIG_ID): loads Facebook's SDK, opens
// the sign-up popup and returns the 30-second code plus the number and WhatsApp account the seller picked. The
// server finishes it (POST /api/app/inbox/whatsapp { action: "embedded_signup" }). Used by "Peggy on WhatsApp" and the
// WhatsApp card on /channels.

const GRAPH_VERSION = "v21.0";

declare global {
  interface Window {
    FB?: {
      init: (options: Record<string, unknown>) => void;
      login: (callback: (response: { authResponse?: { code?: string } | null; status?: string }) => void, options: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

/** Thrown with code "closed" (they closed the popup), "no_number" (no number came back) or "sdk" (couldn't load). */
export class EmbeddedSignupError extends Error {
  constructor(readonly code: "closed" | "no_number" | "sdk", message: string) {
    super(message);
  }
}

export function loadFacebookSdk(appId: string): Promise<NonNullable<Window["FB"]>> {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve(window.FB);
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version: GRAPH_VERSION });
      resolve(window.FB!);
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => reject(new EmbeddedSignupError("sdk", "Facebook couldn't open here. Check your internet and try again."));
    document.body.appendChild(script);
    window.setTimeout(() => reject(new EmbeddedSignupError("sdk", "Facebook took too long to open. Check your internet and try again.")), 15_000);
  });
}

export async function runEmbeddedSignup(signup: { appId: string; configId: string }): Promise<{ code: string; phoneNumberId: string; wabaId: string }> {
  let session: { phone_number_id?: string; waba_id?: string } | null = null;
  const onMessage = (event: MessageEvent) => {
    let host = "";
    try {
      host = new URL(event.origin).hostname;
    } catch {
      return;
    }
    if (host !== "facebook.com" && !host.endsWith(".facebook.com")) return;
    try {
      const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      if (data?.type === "WA_EMBEDDED_SIGNUP" && typeof data.event === "string" && data.event.startsWith("FINISH")) session = data.data ?? null;
    } catch {
      // Other Facebook messages aren't JSON.
    }
  };
  window.addEventListener("message", onMessage);
  try {
    const FB = await loadFacebookSdk(signup.appId);
    const code = await new Promise<string | null>((resolve) => {
      FB.login((response) => resolve(response.authResponse?.code ?? null), { config_id: signup.configId, response_type: "code", override_default_response_type: true, extras: { setup: {}, sessionInfoVersion: "3" } });
    });
    if (!code) throw new EmbeddedSignupError("closed", "closed");
    // The number and account ids arrive in a separate message from Facebook; give it a moment.
    for (let i = 0; i < 20 && !session; i++) await new Promise((r) => window.setTimeout(r, 150));
    const info = session as { phone_number_id?: string; waba_id?: string } | null;
    if (!info?.phone_number_id || !info?.waba_id) throw new EmbeddedSignupError("no_number", "no_number");
    return { code, phoneNumberId: info.phone_number_id, wabaId: info.waba_id };
  } finally {
    window.removeEventListener("message", onMessage);
  }
}
