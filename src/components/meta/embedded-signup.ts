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

/**
 * Thrown with code "closed" (they closed Facebook's window), "no_number" (no number came back), "sdk" (couldn't
 * load), "blocked" (the browser never opened Facebook's window) or "timeout" (no answer from Facebook at all).
 */
export class EmbeddedSignupError extends Error {
  constructor(readonly code: "closed" | "no_number" | "sdk" | "blocked" | "timeout", message: string) {
    super(message);
  }
}

let sdkReady: NonNullable<Window["FB"]> | null = null;
let sdkLoading: Promise<NonNullable<Window["FB"]>> | null = null;

/**
 * Loads Facebook's SDK once. Call it when the page opens (preloadFacebookSdk): FB.login must run inside the tap
 * itself, or the browser treats Facebook's window as an unwanted popup and blocks it. Loading the SDK inside the tap
 * took too long on phones, so the window was blocked and the button said "Connecting…" forever.
 */
export function loadFacebookSdk(appId: string): Promise<NonNullable<Window["FB"]>> {
  if (sdkReady) return Promise.resolve(sdkReady);
  if (sdkLoading) return sdkLoading;
  sdkLoading = new Promise<NonNullable<Window["FB"]>>((resolve, reject) => {
    if (window.FB) {
      sdkReady = window.FB;
      return resolve(window.FB);
    }
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version: GRAPH_VERSION });
      sdkReady = window.FB!;
      resolve(sdkReady);
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => reject(new EmbeddedSignupError("sdk", "Facebook couldn't open here. Check your internet and try again."));
    document.body.appendChild(script);
    window.setTimeout(() => reject(new EmbeddedSignupError("sdk", "Facebook took too long to open. Check your internet and try again.")), 15_000);
  });
  // A failed load can be tried again on the next tap.
  sdkLoading.catch(() => {
    sdkLoading = null;
  });
  return sdkLoading;
}

/** Starts loading Facebook's SDK in the background (on page open), so the Connect tap can open Facebook at once. */
export function preloadFacebookSdk(appId: string) {
  void loadFacebookSdk(appId).catch(() => undefined);
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
    // Preloaded on page open: FB.login then runs right away, still inside the tap.
    const FB = sdkReady ?? (await loadFacebookSdk(signup.appId));
    const code = await new Promise<string | null>((resolve, reject) => {
      // FB.login never calls back when its window was blocked, or (in a phone's in-app browser) when the seller
      // comes back without Facebook reporting. Never wait forever: notice those and let them tap again.
      let left = false;
      let backTimer: number | undefined;
      const onLeave = () => {
        left = true;
        window.clearTimeout(backTimer);
      };
      const onVisibility = () => {
        if (document.visibilityState === "hidden") return onLeave();
        // Back on this page with no answer from Facebook: they closed it, or it couldn't report back.
        if (left) backTimer = window.setTimeout(() => finish(() => reject(new EmbeddedSignupError("closed", "closed"))), 45_000);
      };
      const blockedTimer = window.setTimeout(() => {
        // Facebook's window takes the focus when it opens; still here and focused: it never opened.
        if (!left && document.visibilityState === "visible" && document.hasFocus()) finish(() => reject(new EmbeddedSignupError("blocked", "Facebook's window didn't open. Tap the button again.")));
      }, 4000);
      const capTimer = window.setTimeout(() => finish(() => reject(new EmbeddedSignupError("timeout", "Facebook didn't answer. Tap the button to try again."))), 10 * 60_000);
      let settled = false;
      function finish(then: () => void) {
        if (settled) return;
        settled = true;
        window.clearTimeout(blockedTimer);
        window.clearTimeout(capTimer);
        window.clearTimeout(backTimer);
        window.removeEventListener("blur", onLeave);
        document.removeEventListener("visibilitychange", onVisibility);
        then();
      }
      window.addEventListener("blur", onLeave);
      document.addEventListener("visibilitychange", onVisibility);
      FB.login((response) => finish(() => resolve(response.authResponse?.code ?? null)), { config_id: signup.configId, response_type: "code", override_default_response_type: true, extras: { setup: {}, sessionInfoVersion: "3" } });
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
