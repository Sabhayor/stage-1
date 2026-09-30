/*
 * Service worker for background reminders.
 *
 * The in-app poller (components/ReminderEngine.tsx) covers the "app open" case;
 * this worker handles notifications that arrive through web push while the tab
 * is closed - typically from a scheduled call to POST /api/notifications/dispatch.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "Reminder";
  const options = {
    body: payload.body || "Reminder from your workspace",
    tag: payload.reminderId || undefined,
    data: { url: payload.url || "/reminders" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const target = data.url || "/reminders";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(target) && "focus" in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});
