/* Visitors service worker: receives push notifications about new birds. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "A bird was heard", body: event.data && event.data.text() };
  }
  const title = data.title || "New bird heard";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    image: data.image,
    tag: data.tag || "bird",
    renotify: !!data.renotify,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
