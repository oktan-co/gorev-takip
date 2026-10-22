/* Arka planda bildirim almak için servis çalışanı.
   Bildirimleri Firebase kendisi gösterir; her bildirim ayrı ve sesli gelir.
   Firebase ayarları sayfa tarafından adres satırında gönderilir. */
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

let config = null;
try {
  const raw = new URL(self.location).searchParams.get("c");
  if (raw) config = JSON.parse(raw);
} catch (e) { /* yok sayılır */ }

if (config) {
  firebase.initializeApp(config);
  firebase.messaging();
}

// Uygulamanın kendi gösterdiği bildirimlere (test, ön planda gelen) tıklanınca uygulamayı aç.
// Firebase'in gönderdiklerini Firebase kendisi açar.
self.addEventListener("notificationclick", (event) => {
  if (event.notification.data && event.notification.data.FCM_MSG) return;
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) if ("focus" in w) return w.focus();
      return clients.openWindow(self.registration.scope);
    })
  );
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
