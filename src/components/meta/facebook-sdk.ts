"use client";

// The Facebook JavaScript SDK, loaded once per page, for Facebook Login for Business popups (WhatsApp Embedded
// Signup and the Pages & Instagram connect). The browser only gets a 30-second code; the server swaps it.

export const FB_GRAPH_VERSION = "v21.0";

declare global {
  interface Window {
    FB?: {
      init: (options: Record<string, unknown>) => void;
      login: (callback: (response: { authResponse?: { code?: string } | null; status?: string }) => void, options: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

let loading: Promise<NonNullable<Window["FB"]>> | null = null;

export function loadFacebookSdk(appId: string, errors: { failed: string; slow: string }): Promise<NonNullable<Window["FB"]>> {
  if (window.FB) return Promise.resolve(window.FB);
  if (loading) return loading;
  loading = new Promise<NonNullable<Window["FB"]>>((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version: FB_GRAPH_VERSION });
      resolve(window.FB!);
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => reject(new Error(errors.failed));
    document.body.appendChild(script);
    window.setTimeout(() => reject(new Error(errors.slow)), 15_000);
  }).catch((error: Error) => {
    loading = null;
    throw error;
  });
  return loading;
}

/** Opens Facebook Login for Business with a configuration id; resolves with the code, or null when closed. */
export async function facebookLoginCode(appId: string, configId: string, errors: { failed: string; slow: string }, extras?: Record<string, unknown>): Promise<string | null> {
  const FB = await loadFacebookSdk(appId, errors);
  return new Promise<string | null>((resolve) => {
    FB.login((response) => resolve(response.authResponse?.code ?? null), { config_id: configId, response_type: "code", override_default_response_type: true, ...(extras ? { extras } : {}) });
  });
}
