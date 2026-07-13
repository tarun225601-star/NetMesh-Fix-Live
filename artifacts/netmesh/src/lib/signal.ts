/**
 * SignalClient — thin WebSocket wrapper for WebRTC signaling.
 *
 * Connects to the API server's /api/ws/signal endpoint (proxied
 * through the Vite dev server in development).
 */

export type SignalMsg = { type: string } & Record<string, unknown>;

type Handler = (msg: SignalMsg) => void;

export class SignalClient {
  private ws: WebSocket | null = null;
  private handlers: Handler[] = [];
  private _onClose: (() => void) | null = null;

  /** Build the correct WebSocket URL regardless of environment. */
  static buildUrl(role: "worker" | "buyer", sessionId?: string): string {
    // Use same origin as the page — Vite proxy forwards /api/ws/* to the API server.
    const loc = window.location;
    const proto = loc.protocol === "https:" ? "wss:" : "ws:";
    // BASE_URL ends with '/' (e.g. '/netmesh/'), so strip trailing slash.
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    const params = new URLSearchParams({ role });
    if (sessionId) params.set("session", sessionId);
    return `${proto}//${loc.host}${base}/api/ws/signal?${params}`;
  }

  connect(role: "worker" | "buyer", sessionId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = SignalClient.buildUrl(role, sessionId);
      this.ws = new WebSocket(url);

      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(new Error(`Signal WS error: ${(e as ErrorEvent).message ?? "unknown"}`));

      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as SignalMsg;
          this.handlers.forEach((h) => h(msg));
        } catch {
          // ignore non-JSON frames
        }
      };

      this.ws.onclose = () => {
        this._onClose?.();
      };
    });
  }

  send(msg: SignalMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /** Subscribe to incoming messages. Returns an unsubscribe function. */
  onMessage(handler: Handler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  onClose(handler: () => void) {
    this._onClose = handler;
  }

  close() {
    this.ws?.close();
    this.ws = null;
    this.handlers = [];
  }
}
