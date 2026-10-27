/* Shopinbos web push (src/lib/notifications/web-push-client.ts registers this). Shows notifications sent by the
   server (src/lib/notifications/push.server.ts) and opens the right page when one is clicked. Only push: no
   caching, so it never changes how the app loads. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = { title: "Shopinbos", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Shopinbos";
  const options = {
    body: data.body || "",
    icon: "/icon.png",
    badge: "/brand/logos/shopping%20boss%20white%20icon.png",
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || "/home/notifications", notificationId: data.notificationId || null },
  };
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      if (typeof data.badge === "number" && self.navigator && "setAppBadge" in self.navigator) {
        try {
          if (data.badge > 0) await self.navigator.setAppBadge(data.badge);
          else await self.navigator.clearAppBadge();
        } catch (error) {
          /* badges are optional */
        }
      }
      // Open tabs refresh their bell straight away.
      const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const tab of tabs) tab.postMessage({ type: "shopinbos:notification", notificationId: data.notificationId || null });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/home/notifications", self.location.origin);
  if (target.origin !== self.location.origin) return;
  const notificationId = event.notification.data && event.notification.data.notificationId;
  event.waitUntil(
    (async () => {
      if (notificationId) {
        // Clicking it reads it (cookies go with same-origin requests from the worker).
        fetch("/api/notifications", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: notificationId }) }).catch(() => {});
        // The Push center's "opened" count (only its campaigns count).
        fetch("/api/notifications/opened", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationId }) }).catch(() => {});
      }
      const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const tab of tabs) {
        if (new URL(tab.url).origin === self.location.origin && "focus" in tab) {
          await tab.focus();
          if ("navigate" in tab) return tab.navigate(target.href);
          return;
        }
      }
      return self.clients.openWindow(target.href);
    })(),
  );
});
