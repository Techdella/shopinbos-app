"use client";

// Browser side of web push: register /sw-push.js, ask for permission, subscribe with the server's VAPID key and
// send the subscription to /api/notifications/devices. Everything is optional: without a key (web push not set
// up) or in browsers without push, the state says so and nothing is asked.

export type WebPushState = "unsupported" | "unavailable" | "denied" | "off" | "on";

const SW_URL = "/sw-push.js";

export function webPushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

let keyPromise: Promise<string | null> | null = null;
function serverKey() {
  keyPromise ??= fetch("/api/notifications/devices", { credentials: "include" })
    .then((response) => (response.ok ? response.json() : null))
    .then((body: { data?: { webPushPublicKey?: string | null } } | null) => body?.data?.webPushPublicKey ?? null)
    .catch(() => null);
  return keyPromise;
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration(SW_URL)) ?? navigator.serviceWorker.register(SW_URL, { scope: "/" });
}

async function save(subscription: PushSubscription) {
  const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const response = await fetch("/api/notifications/devices", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "webpush", platform: "web", subscription: { endpoint: json.endpoint, keys: json.keys }, deviceName: navigator.userAgent.slice(0, 80) }),
  });
  if (!response.ok) throw new Error("We couldn't turn on notifications for this browser. Try again.");
}

export async function webPushState(): Promise<WebPushState> {
  if (!webPushSupported()) return "unsupported";
  if (!(await serverKey())) return "unavailable";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  const existing = await navigator.serviceWorker.getRegistration(SW_URL);
  const subscription = await existing?.pushManager.getSubscription();
  return subscription ? "on" : "off";
}

/** Asks the browser (must be called from a click), subscribes and saves it. Returns the new state. */
export async function enableWebPush(): Promise<WebPushState> {
  if (!webPushSupported()) return "unsupported";
  const key = await serverKey();
  if (!key) return "unavailable";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const subscription = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
  await save(subscription);
  return "on";
}

export async function disableWebPush(): Promise<WebPushState> {
  if (!webPushSupported()) return "unsupported";
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  const subscription = await reg?.pushManager.getSubscription();
  if (subscription) {
    await fetch("/api/notifications/devices", { method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: subscription.endpoint }) }).catch(() => null);
    await subscription.unsubscribe().catch(() => false);
  }
  return "off";
}

/** Once per visit: if this browser is already subscribed, tell the server it's still here (keeps it active). */
export async function refreshWebPush() {
  try {
    if (!webPushSupported() || Notification.permission !== "granted") return;
    if (sessionStorage.getItem("shopinbos.webpush.refreshed")) return;
    const reg = await navigator.serviceWorker.getRegistration(SW_URL);
    const subscription = await reg?.pushManager.getSubscription();
    if (!subscription) return;
    await save(subscription);
    sessionStorage.setItem("shopinbos.webpush.refreshed", "1");
  } catch {
    // Not important: the next visit tries again.
  }
}
