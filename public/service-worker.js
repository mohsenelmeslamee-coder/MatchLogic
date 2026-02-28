const CACHE_NAME = "matchlogic-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([
        "/",
        "/index.html",
        "/match.html",
        "/css/style.css",
        "/js/main.js",
        "/js/match.js",
        "/manifest.json"
      ])
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.url.includes("/api/")) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

// ——— Push API: استقبال الإشعارات حتى مع إغلاق المتصفح ———
self.addEventListener("push", (event) => {
  let payload = { title: "MatchLogic", body: "" };
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload.body = event.data.text();
    }
  }
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.tag || "matchlogic",
    requireInteraction: false,
    data: payload.data || { url: "/" }
  };
  event.waitUntil(
    self.registration.showNotification(payload.title || "MatchLogic", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let url = event.notification.data?.url || "/";
  try {
    const base = new URL(self.registration.scope).origin;
    if (url.startsWith("/")) url = base + url;
  } catch (_) {}
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      if (clientList.length) {
        const c = clientList[0];
        if (c.navigate) c.navigate(url);
        c.focus();
      } else if (self.clients.openWindow) {
        self.clients.openWindow(url);
      }
    })
  );
});
