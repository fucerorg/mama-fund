// ════════════════════════════════════════════════════
// MamaFund Service Worker — Web Push via Firebase Cloud Messaging (FCM)
// v1.2.0
// ════════════════════════════════════════════════════
// Runs as a classic service worker (importScripts, no ES modules), so we use
// the Firebase *compat* SDK. Keep this version in sync with the compat script
// tags in index.html.
//
// The firebaseConfig below is the PUBLIC web app config from the Firebase
// console — safe to commit, it contains no secrets. The backend sends
// DATA-ONLY messages (data: {title, body, url}); we build the notification
// here so there are no duplicate notifications on browsers that would also
// auto-display a "notification" payload.

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDi3J5UGAfK6Lpa61bede0mz84Ib4T8ovA",
  authDomain: "mama-fund.firebaseapp.com",
  projectId: "mama-fund",
  storageBucket: "mama-fund.firebasestorage.app",
  messagingSenderId: "434284641729",
  appId: "1:434284641729:web:97c80a714ffacddb174340",
});

const messaging = firebase.messaging();

// Background messages: fired when the app is not in the foreground.
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {};
  const n = payload.notification || {};
  const title = d.title || n.title || "MamaFund";
  const body  = d.body  || n.body  || "";
  self.registration.showNotification(title, {
    body,
    icon: "/logo.png",
    badge: "/logo.png",
    data: { url: d.url || "https://moni.fucer.org" },
  });
});

// Notification click: focus an already-open MamaFund tab, or open the app.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "https://moni.fucer.org";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(url) && "focus" in w) return w.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
