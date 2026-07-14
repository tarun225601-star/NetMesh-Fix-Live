/**
 * NetMesh Service Worker
 * ──────────────────────
 * Best-effort background heartbeat helper for the WebRTC signaling/tunnel
 * connection. A Service Worker cannot itself hold an RTCPeerConnection or a
 * WebSocket open on the page's behalf — browsers do not expose WebRTC inside
 * the SW execution context, and OS/browser power management will still
 * suspend a backgrounded tab's timers. What this SW *can* do:
 *
 *  1. Stay registered/active independently of page visibility, and act as a
 *     secondary heartbeat clock that nudges every open client tab to send a
 *     DataChannel ping, even if the tab's own timers have been throttled.
 *  2. Answer a lightweight `fetch` on /sw-ping so the browser sees ongoing
 *     network-adjacent activity from this origin, which some browsers use as
 *     a signal that the page is still "active."
 *
 * Combined with the Page Visibility API + Wake Lock + silent-media hacks in
 * src/lib/keepalive.ts, this closes most of the gap — but on iOS/Android,
 * OS-level backgrounding can still eventually suspend the tab entirely.
 */

const HEARTBEAT_MS = 15_000;
let heartbeatTimer = null;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Passthrough — we don't want to intercept or cache app requests, but
// registering a fetch handler is what makes some browsers treat this SW
// (and its associated tabs) as having an active background task.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.endsWith("/sw-ping")) {
    event.respondWith(new Response("pong", { status: 200 }));
  }
  // All other requests: let the browser handle normally (no interception).
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "keepalive:start") startHeartbeat();
  if (data.type === "keepalive:stop") stopHeartbeat();
});

async function broadcast(msg) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  for (const client of clients) client.postMessage(msg);
}

function startHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    void broadcast({ type: "keepalive:tick", ts: Date.now() });
  }, HEARTBEAT_MS);
  void broadcast({ type: "keepalive:tick", ts: Date.now() });
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
