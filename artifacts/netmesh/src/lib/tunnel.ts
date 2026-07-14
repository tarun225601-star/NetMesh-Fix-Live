/**
 * WebRTCTunnel — core P2P tunnel over RTCDataChannel.
 *
 * Protocol (all messages are JSON strings over the data channel):
 *
 *   Buyer → Worker:
 *     { type: 'ping' }
 *     { type: 'proxy-request', id, method, url, headers, body? }
 *
 *   Worker → Buyer:
 *     { type: 'pong' }
 *     { type: 'proxy-response', id, status, statusText, headers, body }
 *     { type: 'proxy-error',    id, error }
 *
 * The Worker fetches the requested URL using its own internet connection
 * (browser fetch) and returns the response. This is a real HTTP proxy over
 * WebRTC DataChannel.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type TunnelPhase =
  | "idle"
  | "signaling"
  | "connecting"
  | "connected"
  | "failed"
  | "closed";

export interface ProxyRequest {
  id: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface ProxyResponse {
  id: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  error?: string;
}

export type LogKind = "info" | "success" | "warn" | "error";

// ── ICE servers (public STUN — no TURN needed for same-LAN peers) ─────────────

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

// Hop-by-hop headers that must not be forwarded to the origin server
const HOP_BY_HOP = new Set([
  "connection",
  "proxy-connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "proxy-authorization",
  "proxy-authenticate",
]);

// ── WebRTCTunnel class ────────────────────────────────────────────────────────

export class WebRTCTunnel {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private pending = new Map<string, (r: ProxyResponse) => void>();
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  /** Only the Worker measures getStats() and broadcasts the figure — the
   *  Buyer just displays whatever the Worker sends, so both sides always
   *  show the exact same number instead of two independently-measured ones. */
  private role: "worker" | "buyer" | null = null;

  // Callbacks set by the consumer
  onPhaseChange: (phase: TunnelPhase) => void = () => {};
  onLog: (msg: string, kind: LogKind) => void = () => {};
  onStats: (delta: { requests: number; bytes: number }) => void = () => {};
  /** Cumulative bytes transferred over the RTCDataChannel this session, from getStats(). */
  onDataUsage: (totalBytes: number) => void = () => {};
  /** Fired when the remote peer announces its network provider name. */
  onNetworkInfo: (provider: string) => void = () => {};

  // ── Internal helpers ───────────────────────────────────────────────────────

  private log(msg: string, kind: LogKind = "info") {
    this.onLog(msg, kind);
  }

  private setPhase(p: TunnelPhase) {
    this.onPhaseChange(p);
  }

  private buildPC(): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "connected") this.setPhase("connected");
      else if (s === "failed" || s === "closed") this.setPhase("failed");
    };

    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      if (s === "checking") this.setPhase("connecting");
    };

    this.pc = pc;
    return pc;
  }

  private wireDataChannel(dc: RTCDataChannel) {
    this.dc = dc;
    dc.binaryType = "arraybuffer";

    dc.onopen = () => {
      this.setPhase("connected");
      this.log("Data channel open — tunnel live ✓", "success");
      this.startStatsPolling();
    };

    dc.onclose = () => {
      this.setPhase("closed");
      this.log("Data channel closed", "warn");
      this.stopStatsPolling();
    };

    dc.onerror = (e) => {
      this.log(`Data channel error: ${(e as RTCErrorEvent).error?.message ?? "unknown"}`, "error");
    };

    dc.onmessage = (e) => this.dispatch(e.data as string);
  }

  // ── Live data-usage tracking via WebRTC getStats() ──────────────────────────

  private startStatsPolling() {
    if (this.statsTimer) return;
    if (this.role !== "worker") return; // Buyer receives usage via "data-usage" messages instead
    void this.pollStats(); // immediate first read
    this.statsTimer = setInterval(() => void this.pollStats(), 2_000);
  }

  private stopStatsPolling() {
    if (this.statsTimer !== null) clearInterval(this.statsTimer);
    this.statsTimer = null;
  }

  private async pollStats() {
    if (!this.pc) return;
    // Only the Worker measures — the Buyer receives the number via the
    // "data-usage" message instead, so both sides are always in sync.
    if (this.role !== "worker") return;
    try {
      const report = await this.pc.getStats();
      let dataChannelBytes = 0;
      let candidatePairBytes = 0;

      report.forEach((stat) => {
        // Prefer exact RTCDataChannel byte counters — these reflect only the
        // application-level tunnel traffic, not STUN/ICE keepalive overhead.
        if (stat.type === "data-channel") {
          const s = stat as unknown as { bytesSent?: number; bytesReceived?: number };
          dataChannelBytes += (s.bytesSent ?? 0) + (s.bytesReceived ?? 0);
        }
        // Fallback: the currently selected ICE candidate pair's total
        // transport bytes, used only if data-channel stats aren't reported
        // by this browser.
        if (stat.type === "candidate-pair" && (stat as RTCIceCandidatePairStats).state === "succeeded") {
          const s = stat as unknown as { bytesSent?: number; bytesReceived?: number };
          candidatePairBytes += (s.bytesSent ?? 0) + (s.bytesReceived ?? 0);
        }
      });

      const total = dataChannelBytes > 0 ? dataChannelBytes : candidatePairBytes;
      this.onDataUsage(total);
      // Sync the "Total Data Shared" figure to the Buyer in real time so
      // both UIs always show the exact same number.
      if (this.dc?.readyState === "open") {
        this.dc.send(JSON.stringify({ type: "data-usage", totalBytes: total }));
      }
    } catch {
      // getStats() can throw transiently during ICE renegotiation — ignore.
    }
  }

  /** Worker → Buyer: announce which mobile/ISP network is relaying traffic. */
  sendNetworkInfo(provider: string) {
    if (this.dc?.readyState === "open") {
      this.dc.send(JSON.stringify({ type: "network-info", provider }));
    }
  }

  private dispatch(raw: string) {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    const type = msg["type"] as string;

    if (type === "ping") {
      this.dc?.send(JSON.stringify({ type: "pong" }));
      return;
    }
    if (type === "pong") return;

    if (type === "proxy-request") {
      // Worker side: receive a request from the Buyer
      void this.serveRequest(msg as unknown as ProxyRequest);
      return;
    }

    if (type === "proxy-response" || type === "proxy-error") {
      // Buyer side: resolve a pending request promise
      const r = msg as unknown as ProxyResponse;
      const resolve = this.pending.get(r.id);
      if (resolve) {
        this.pending.delete(r.id);
        resolve(r);
      }
      return;
    }

    if (type === "network-info") {
      this.onNetworkInfo((msg as unknown as { provider: string }).provider);
      return;
    }

    if (type === "data-usage") {
      // Buyer side: display the Worker's authoritative, live-measured total.
      this.onDataUsage((msg as unknown as { totalBytes: number }).totalBytes);
    }
  }

  // ── Worker: serve a proxy request ─────────────────────────────────────────

  private async serveRequest(req: ProxyRequest) {
    this.log(`→ ${req.method} ${req.url}`, "info");

    try {
      // Strip hop-by-hop headers
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers ?? {})) {
        if (!HOP_BY_HOP.has(k.toLowerCase())) headers[k] = v;
      }
      // Never send a Host header — let the browser derive it from the URL
      delete headers["host"];

      const fetchInit: RequestInit = {
        method: req.method,
        headers,
        body: req.body && !["GET", "HEAD"].includes(req.method) ? req.body : undefined,
        redirect: "follow",
        credentials: "omit",
        cache: "no-store",
      };

      const res = await fetch(req.url, fetchInit);
      const body = await res.text();

      const respHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        if (!HOP_BY_HOP.has(k.toLowerCase())) respHeaders[k] = v;
      });

      const reply: ProxyResponse = {
        id: req.id,
        status: res.status,
        statusText: res.statusText,
        headers: respHeaders,
        body,
      };

      this.dc?.send(JSON.stringify({ type: "proxy-response", ...reply }));
      this.onStats({ requests: 1, bytes: body.length });
      this.log(`← ${res.status} ${req.url}`, res.ok ? "success" : "warn");
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      this.dc?.send(JSON.stringify({ type: "proxy-error", id: req.id, error }));
      this.log(`✗ ${req.url} — ${error}`, "error");
    }
  }

  // ── Public API: Worker side ────────────────────────────────────────────────

  /**
   * Called by the Worker after receiving a buyer's SDP offer via signaling.
   * Returns the SDP answer to be sent back through signaling.
   */
  async answerOffer(
    offer: RTCSessionDescriptionInit,
    onIce: (c: RTCIceCandidateInit) => void,
  ): Promise<RTCSessionDescriptionInit> {
    const pc = this.buildPC();

    pc.ondatachannel = (e) => this.wireDataChannel(e.channel);
    pc.onicecandidate = (e) => { if (e.candidate) onIce(e.candidate.toJSON()); };

    this.role = "worker";
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.setPhase("connecting");
    return answer;
  }

  // ── Public API: Buyer side ─────────────────────────────────────────────────

  /**
   * Called by the Buyer to initiate the connection.
   * Returns the SDP offer to be sent through signaling.
   */
  async createOffer(onIce: (c: RTCIceCandidateInit) => void): Promise<RTCSessionDescriptionInit> {
    this.role = "buyer";
    const pc = this.buildPC();
    const dc = pc.createDataChannel("tunnel", { ordered: true });
    this.wireDataChannel(dc);
    pc.onicecandidate = (e) => { if (e.candidate) onIce(e.candidate.toJSON()); };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.setPhase("connecting");
    return offer;
  }

  async setRemoteAnswer(answer: RTCSessionDescriptionInit) {
    await this.pc?.setRemoteDescription(answer);
  }

  async addIceCandidate(candidate: RTCIceCandidateInit) {
    try {
      await this.pc?.addIceCandidate(candidate);
    } catch {
      // Stale candidate — ignore
    }
  }

  // ── Buyer: send a proxied HTTP request ────────────────────────────────────

  fetch(
    url: string,
    options: { method?: string; headers?: Record<string, string>; body?: string } = {},
  ): Promise<ProxyResponse> {
    return new Promise((resolve, reject) => {
      if (this.dc?.readyState !== "open") {
        reject(new Error("Tunnel not connected"));
        return;
      }

      const id = Math.random().toString(36).slice(2, 10);

      // Timeout after 15 s
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Request timed out (15 s)"));
      }, 15_000);

      this.pending.set(id, (r) => {
        clearTimeout(timer);
        resolve(r);
      });

      const req: ProxyRequest = {
        id,
        method: options.method ?? "GET",
        url,
        headers: options.headers ?? {},
        body: options.body,
      };
      this.dc.send(JSON.stringify({ type: "proxy-request", ...req }));
    });
  }

  // ── Keep-alive ────────────────────────────────────────────────────────────

  ping() {
    if (this.dc?.readyState === "open") {
      this.dc.send(JSON.stringify({ type: "ping" }));
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  get dataChannelState(): RTCDataChannelState | "none" {
    return this.dc?.readyState ?? "none";
  }

  close() {
    this.stopStatsPolling();
    this.pending.clear();
    try { this.dc?.close(); } catch { /* ignore */ }
    try { this.pc?.close(); } catch { /* ignore */ }
    this.dc = null;
    this.pc = null;
    this.setPhase("closed");
  }
}
