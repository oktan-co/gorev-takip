/* Arka planda bildirim almak için servis çalışanı.
   Firebase ayarları, sayfa tarafından kayıt sırasında adres satırında gönderilir,
   bu yüzden burada ayar düzenlemene gerek yok. */
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

let config = null;
try {
  const raw = new URL(self.location).searchParams.get("c");
  if (raw) config = JSON.parse(raw);
} catch (e) { /* yok sayılır */ }

if (config) {
  firebase.initializeApp(config);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const n = payload.notification || {};
    self.registration.showNotification(n.title || "Görevlerim", {
      body: n.body || "",
      icon: "icon-192.png",
      badge: "icon-192.png",
      tag: "gorev-hatirlatma",
      data: { url: (payload.fcmOptions && payload.fcmOptions.link) || "./" }
    });
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) if ("focus" in w) return w.focus();
      return clients.openWindow(url);
    })
  );
});
