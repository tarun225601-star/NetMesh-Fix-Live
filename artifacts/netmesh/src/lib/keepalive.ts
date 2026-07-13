/**
 * KeepAliveManager — prevents the Worker browser tab (especially on mobile)
 * from sleeping and dropping the WebRTC connection.
 *
 * Three-layer strategy:
 *  1. DataChannel ping every 20 s  → keeps the RTCPeerConnection alive
 *  2. Screen Wake Lock API         → prevents the phone screen from turning off
 *  3. NoSleep silent-video trick   → iOS / Safari fallback when Wake Lock is unavailable
 */

export class KeepAliveManager {
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private wakeLock: WakeLockSentinel | null = null;
  private noSleepVideo: HTMLVideoElement | null = null;
  private started = false;

  async start(sendPing: () => void) {
    if (this.started) return;
    this.started = true;

    // 1. Periodic ping ──────────────────────────────────────────────────────
    sendPing(); // immediate first ping
    this.pingInterval = setInterval(sendPing, 20_000);

    // 2. Screen Wake Lock (Chrome 84+, Edge 84+, Android Chrome) ────────────
    await this.acquireWakeLock();

    // Re-acquire when tab becomes visible again (wake lock is released on hide)
    document.addEventListener("visibilitychange", this.handleVisibility);

    // 3. NoSleep silent video loop (iOS Safari fallback) ────────────────────
    this.startNoSleepVideo();
  }

  private handleVisibility = async () => {
    if (document.visibilityState === "visible") {
      await this.acquireWakeLock();
    }
  };

  private async acquireWakeLock() {
    try {
      if ("wakeLock" in navigator) {
        this.wakeLock = await (navigator as Navigator & { wakeLock: WakeLock }).wakeLock.request("screen");
        this.wakeLock.addEventListener("release", () => {
          this.wakeLock = null;
        });
      }
    } catch {
      // Not supported or denied — no-op; NoSleep video handles the fallback
    }
  }

  private startNoSleepVideo() {
    // A 1×1 transparent, muted video loop.  Playing any media (even silent)
    // signals to iOS that the page is "active" and prevents forced suspension.
    const video = document.createElement("video");
    video.setAttribute("playsinline", "true");
    video.setAttribute("muted", "true");
    video.loop = true;
    video.muted = true;
    video.style.cssText =
      "position:fixed;top:-1px;left:-1px;width:1px;height:1px;opacity:0;pointer-events:none;";

    // Minimal valid MP4 (ftyp + mdat, ~70 bytes) encoded as a data URI
    // Source: https://github.com/nicktacular/no-sleep/blob/master/src/NoSleep.js
    video.src =
      "data:video/mp4;base64," +
      "AAAAIGZ0eXBpc29tAAACAGlzb21pc28ybXA0MQAAAA9tZGF0AAAA" +
      "Amndat";

    document.body.appendChild(video);
    video.play().catch(() => {
      // Autoplay blocked — that's fine; Wake Lock will still work on Chrome
    });
    this.noSleepVideo = video;
  }

  /** Active status for display in the UI. */
  get isActive(): boolean {
    return this.started;
  }

  get hasWakeLock(): boolean {
    return this.wakeLock !== null;
  }

  stop() {
    this.started = false;
    if (this.pingInterval !== null) clearInterval(this.pingInterval);
    this.pingInterval = null;
    this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
    this.noSleepVideo?.remove();
    this.noSleepVideo = null;
    document.removeEventListener("visibilitychange", this.handleVisibility);
  }
}
