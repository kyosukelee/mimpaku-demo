// 画面の枠(HTML・JS・CSS・アイコン)だけをキャッシュする。
// データ(Supabase)は別のドメインなので、ここでは一切扱わない。
const CACHE = "console-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png"];

// 最初の訪問で、画面を作るJS・CSSも先に保存する(初回のあとすぐ電波がなくなっても開けるように)
async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL);
  const html = await (await fetch("/", { cache: "no-store" })).text();
  const assets = [...new Set(html.match(/\/assets\/[^"']+/g) || [])];
  await Promise.all(assets.map((a) => cache.add(a).catch(() => undefined)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // ページ本体: まず通信して最新を取り、だめなら保存済みを出す
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("/", copy)); return res; })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // JS・CSS・画像: ファイル名に内容の印がついているので、保存済みを優先する
  event.respondWith(
    caches.match(req).then((hit) =>
      hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
    )
  );
});
