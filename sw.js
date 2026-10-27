"use strict";
// Upper Hand service worker: cache-first app shell, so the app opens offline after one visit. __BUILD__ is replaced by tools/build-pwa.js
// with a hash of the bundle, so a new build gets a new cache and the old one is deleted. Calls to api.anthropic.com are never touched or cached.
const CACHE = "uh-179f1ae419";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png"];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("uh-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function fontFetch(req) {   // stale-while-revalidate; offline with nothing cached falls back to the system font stack
  const c = await caches.open(CACHE), hit = await c.match(req);
  const net = fetch(req).then(r => { if (r && (r.ok || r.type === "opaque")) c.put(req, r.clone()); return r; }).catch(() => null);
  if (hit) { net.catch(() => 0); return hit; }
  const r = await net;
  if (r) return r;
  return new URL(req.url).hostname === "fonts.googleapis.com" ? new Response("", { status: 200, headers: { "content-type": "text/css" } }) : Response.error();
}
async function shellFetch(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req, { ignoreSearch: true });
  if (hit) return hit;
  if (req.mode === "navigate") { const idx = await c.match("index.html"); if (idx) return idx; }
  const r = await fetch(req);
  if (r && r.ok && r.type === "basic") c.put(req, r.clone());
  return r;
}
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  let url; try { url = new URL(req.url); } catch (x) { return; }
  if (url.hostname === "api.anthropic.com") return;   // never intercept the API
  if (FONT_HOSTS.includes(url.hostname)) { e.respondWith(fontFetch(req)); return; }
  if (url.origin === self.location.origin) e.respondWith(shellFetch(req));
});
