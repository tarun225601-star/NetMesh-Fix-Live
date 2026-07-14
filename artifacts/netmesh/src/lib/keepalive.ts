/**
 * KeepAliveManager — prevents the browser tab (especially on mobile) from
 * sleeping and dropping the WebRTC signaling/tunnel connection.
 *
 * Layered strategy:
 *  1. DataChannel ping every 20 s        → keeps the RTCPeerConnection alive
 *  2. Page Visibility API                → detects tab hide/show, reacts immediately
 *  3. Screen Wake Lock API               → prevents the phone screen from turning off
 *  4. Silent audio + Media Session API   → tricks the OS into treating this tab as
 *                                           an active "Media" playback task, which
 *                                           keeps its process/timers running in the
 *                                           background instead of being suspended
 *  5. Service Worker heartbeat           → best-effort background nudge that keeps
 *                                           firing pings even if the page's own
 *                                           timers get throttled while hidden
 *
 * None of these can *guarantee* an indefinitely-alive background connection —
 * OS-level app/tab suspension (especially iOS Safari) can still eventually win.
 * This is a best-effort stack, layered so that whichever mechanism the current
 * browser/OS respects will keep things going.
 */

export class KeepAliveManager {
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private wakeLock: WakeLockSentinel | null = null;
  private silentAudio: HTMLAudioElement | null = null;
  private swRegistration: ServiceWorkerRegistration | null = null;
  private sendPing: (() => void) | null = null;
  private started = false;
  private hidden = false;

  async start(sendPing: () => void) {
    if (this.started) return;
    this.started = true;
    this.sendPing = sendPing;

    // 1. Periodic ping ──────────────────────────────────────────────────────
    sendPing(); // immediate first ping
    this.pingInterval = setInterval(sendPing, 20_000);

    // 2. Page Visibility API ─────────────────────────────────────────────────
    this.hidden = document.visibilityState === "hidden";
    document.addEventListener("visibilitychange", this.handleVisibility);

    // 3. Screen Wake Lock (Chrome 84+, Edge 84+, Android Chrome) ────────────
    await this.acquireWakeLock();

    // 4. Silent audio + Media Session (keeps the tab classed as "Media") ────
    this.startSilentAudio();

    // 5. Service Worker heartbeat ─────────────────────────────────────────────
    await this.registerServiceWorker();
  }

  // ── Page Visibility ────────────────────────────────────────────────────────

  private handleVisibility = async () => {
    this.hidden = document.visibilityState === "hidden";

    if (!this.hidden) {
      // Tab became visible again: the wake lock is auto-released on hide by
      // the browser, and mobile browsers frequently pause background <audio>
      // elements — restore both immediately, and fire an out-of-band ping so
      // the DataChannel/signal connection doesn't wait for the next 20 s tick.
      await this.acquireWakeLock();
      if (this.silentAudio?.paused) {
        this.silentAudio.play().catch(() => {});
      }
      this.sendPing?.();
    }
  };

  // ── Screen Wake Lock ────────────────────────────────────────────────────────

  private async acquireWakeLock() {
    try {
      if ("wakeLock" in navigator) {
        this.wakeLock = await (navigator as Navigator & { wakeLock: WakeLock }).wakeLock.request("screen");
        this.wakeLock.addEventListener("release", () => {
          this.wakeLock = null;
        });
      }
    } catch {
      // Not supported, denied, or page hidden at request time — no-op;
      // the silent-audio + Media Session hack covers this case.
    }
  }

  // ── Silent audio + Media Session ("keep awake") ─────────────────────────────

  private startSilentAudio() {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/");
    const audio = new Audio(`${base}silence.mp3`);
    audio.loop = true;
    audio.volume = 0; // inaudible, but NOT `muted` — muted media is exempt
    audio.preload = "auto";
    audio.setAttribute("playsinline", "true");
    audio.style.display = "none";
    document.body.appendChild(audio);

    audio.play().catch(() => {
      // Autoplay blocked until a user gesture — the Worker/Buyer "Start"
      // and "Connect" buttons in the UI count as that gesture, so this
      // resolves itself on the next call in practice.
    });
    this.silentAudio = audio;

    // Media Session API: tell the OS this page is playing media. On Android
    // in particular this classifies the tab's process as hosting active
    // media playback, which makes the OS much less aggressive about
    // freezing/killing it in the background.
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: "NetMesh — Tunnel Active",
          artist: "Keeping your P2P connection alive",
          album: "NetMesh",
        });
        navigator.mediaSession.playbackState = "playing";
        // No-op action handlers so OS media controls don't error out.
        const noop = () => {};
        for (const action of ["play", "pause", "stop"] as const) {
          try {
            navigator.mediaSession.setActionHandler(action, noop);
          } catch {
            // Action not supported in this browser — ignore.
          }
        }
      } catch {
        // Media Session not available — silent audio alone still helps.
      }
    }
  }

  // ── Service Worker heartbeat ────────────────────────────────────────────────

  private async registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/");
      this.swRegistration = await navigator.serviceWorker.register(`${base}sw.js`);
      await navigator.serviceWorker.ready;

      navigator.serviceWorker.addEventListener("message", this.handleSwMessage);

      const active = this.swRegistration.active ?? navigator.serviceWorker.controller;
      active?.postMessage({ type: "keepalive:start" });
    } catch {
      // Service Worker unsupported/blocked (e.g. non-HTTPS dev origin) —
      // the page-level ping interval already covers this.
    }
  }

  private handleSwMessage = (event: MessageEvent) => {
    if (event.data?.type === "keepalive:tick") {
      // A background nudge from the Service Worker — send a ping in case the
      // page's own setInterval got throttled while hidden.
      this.sendPing?.();
    }
  };

  /** Active status for display in the UI. */
  get isActive(): boolean {
    return this.started;
  }

  get hasWakeLock(): boolean {
    return this.wakeLock !== null;
  }

  get hasMediaKeepAwake(): boolean {
    return this.silentAudio !== null;
  }

  get hasServiceWorker(): boolean {
    return this.swRegistration !== null;
  }

  get isTabHidden(): boolean {
    return this.hidden;
  }

  stop() {
    this.started = false;
    if (this.pingInterval !== null) clearInterval(this.pingInterval);
    this.pingInterval = null;

    this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;

    this.silentAudio?.pause();
    this.silentAudio?.remove();
    this.silentAudio = null;

    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.playbackState = "none";
      } catch {
        // ignore
      }
    }

    const active = this.swRegistration?.active ?? navigator.serviceWorker?.controller;
    active?.postMessage({ type: "keepalive:stop" });
    navigator.serviceWorker?.removeEventListener("message", this.handleSwMessage);

    document.removeEventListener("visibilitychange", this.handleVisibility);
    this.sendPing = null;
  }
}
