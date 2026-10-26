// Krob service worker: offline shell + Web Push + app badge.
const CACHE = "krob-v13";
const SHELL = [
  "/", "/gym", "/body", "/insights", "/settings",
  "/settings/schedule", "/settings/brain", "/settings/week", "/settings/notifications", "/settings/goals", "/settings/appearance", "/settings/privacy", "/settings/system", "/settings/term",
  "/manifest.webmanifest", "/icon-192.png", "/logo-256.png",
];
const LEGACY = { "/stats": "stats", "/balance": "balance" };
// Same rules as safeAppUrl in src/lib/intent.ts: a same-origin app path or "/" (shared cases in __tests__/url-cases.ts).
const safeUrl = (u) => {
  if (typeof u !== "string" || u.length > 200 || !u.startsWith("/") || u.startsWith("//") || u.includes("\\")) return "/";
  return /^\/[\w\-./?=&%]*$/.test(u) ? u : "/";
};
// Asks an open page to route in-app; resolves true when it acknowledges within `ms` (a v1.7 page never answers).
const askOpen = (c, url, ms) => new Promise((done) => {
  let ch;
  try { ch = new MessageChannel(); } catch { return done(false); }
  const t = setTimeout(() => done(false), ms);
  ch.port1.onmessage = (m) => { if (m.data && m.data.type === "krob-open-ok") { clearTimeout(t); done(true); } };
  try { c.postMessage({ type: "krob-open", url }, [ch.port2]); } catch { clearTimeout(t); done(false); }
});
// Only a 2xx response is worth keeping; a cached 500 would replace the working shell.
const cachePut = (e, req, res) => {
  if (!res.ok) return res;
  const copy = res.clone();
  e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
  return res;
};

self.addEventListener("install", (e) => {
  // Per-URL so one failing page does not abort the whole precache.
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))));
  self.skipWaiting();
});

// applyUpdate() (push.ts) asks a waiting worker to take over before it reloads the page.
self.addEventListener("message", (e) => { if (e.data && e.data.type === "skip-waiting") self.skipWaiting(); });

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;

  // Old pages merged into /insights (mirrors the next.config redirects, also offline and for old cached links).
  const legacy = req.mode === "navigate" && LEGACY[url.pathname];
  if (legacy) {
    const to = new URL("/insights", url);
    to.search = url.search;
    to.searchParams.set("tab", legacy);
    e.respondWith(Response.redirect(to.href, 302));
    return;
  }

  // Pages: network first so updates show up, but a cached copy wins after 2.5 s on a slow link and when offline.
  // One cache entry per path: query variants (/?do=water, /insights?tab=stats) share the page shell.
  if (req.mode === "navigate") {
    const key = new Request(url.pathname);
    const net = fetch(req).then((res) => cachePut(e, key, res));
    // Keep the event alive until the network answers, so a response that loses the race is still cached.
    e.waitUntil(net.catch(() => {}));
    const fallback = () => caches.match("/").then((r) => r || (url.pathname === "/" ? undefined : Response.redirect("/", 302)));
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then((hit) =>
        hit
          ? Promise.race([net, new Promise((r) => setTimeout(() => r(hit), 2500))]).catch(() => hit)
          : net.catch(fallback)
      )
    );
    return;
  }
  // Hashed build assets and icons never change: cache first.
  if (url.pathname.startsWith("/_next/static/") || /\.(png|webp|woff2|webmanifest)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => cachePut(e, req, res))));
  }
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Krob", body: e.data && e.data.text() }; }
  const jobs = [
    self.registration.showNotification(d.title || "Krob", {
      body: d.body || "",
      tag: d.tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: d.url || "/" },
    }),
  ];
  if (typeof d.badge === "number" && self.navigator.setAppBadge) jobs.push(d.badge > 0 ? self.navigator.setAppBadge(d.badge) : self.navigator.clearAppBadge());
  // Tell open windows a push arrived (the setup checker's "test received" step).
  const tell = jobs[0].then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true }))
    .then((list) => list.forEach((c) => c.postMessage({ type: "krob-push", tag: d.tag })));
  e.waitUntil(Promise.all([...jobs, tell]).catch(() => {}));
});

// The push service rotated or dropped this subscription. No network here: open windows heal it (push.ts healPush).
self.addEventListener("pushsubscriptionchange", (e) => {
  try {
    e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((l) => l.forEach((c) => c.postMessage({ type: "krob-push-sub-changed" }))).catch(() => {}));
  } catch {}
});

// v1.8 deep links: no window -> open one at the url (cold start). Otherwise focus it and ask the page to route in-app
// (keeps state, no reload); without an ack in 700 ms (old page, not hydrated yet) navigate when the path or query differ.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = safeUrl(e.notification.data && e.notification.data.url);
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const c = list.find((x) => "focus" in x);
    if (!c) return self.clients.openWindow(url);
    try { await c.focus(); } catch {}
    if (await askOpen(c, url, 700)) return;
    const cur = new URL(c.url), to = new URL(url, self.location.origin);
    if (cur.pathname + cur.search !== to.pathname + to.search) await c.navigate(url).catch(() => self.clients.openWindow(url));
  })().catch(() => {}));
});
