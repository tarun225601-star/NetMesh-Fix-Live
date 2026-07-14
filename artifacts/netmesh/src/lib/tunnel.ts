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

/** Progress callback for a binary (e.g. video) transfer over the tunnel. */
export type BinaryProgress = (received: number, total: number) => void;

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
  private binaryPending = new Map<string, {
    resolve: (blob: Blob) => void;
    reject: (err: Error) => void;
    onProgress?: BinaryProgress;
  }>();
  /** In-flight incoming binary transfer (Buyer side) — one at a time is enough
   *  for the video performance test, since the UI only plays one clip at once. */
  private binaryTransfer: {
    id: string;
    chunks: Uint8Array[];
    received: number;
    total: number;
    contentType: string;
  } | null = null;
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

    dc.onmessage = (e) => {
      if (typeof e.data === "string") {
        this.dispatch(e.data);
      } else {
        this.handleBinaryChunk(e.data as ArrayBuffer);
      }
    };
  }

  // ── Binary streaming (Buyer side): reassemble incoming video chunks ────────

  private handleBinaryChunk(data: ArrayBuffer) {
    const t = this.binaryTransfer;
    if (!t) return; // stray chunk with no active transfer — ignore
    const chunk = new Uint8Array(data);
    t.chunks.push(chunk);
    t.received += chunk.byteLength;
    this.binaryPending.get(t.id)?.onProgress?.(t.received, t.total);
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

    if (type === "binary-request") {
      // Worker side: Buyer wants a binary resource (e.g. a test video)
      // streamed through the tunnel using this device's internet.
      const r = msg as unknown as { id: string; url: string };
      void this.serveBinaryRequest(r.id, r.url);
      return;
    }

    if (type === "binary-start") {
      // Buyer side: Worker is about to stream a binary resource — open a
      // fresh buffer for it, keyed by request id.
      const r = msg as unknown as { id: string; contentType: string; totalBytes: number };
      this.binaryTransfer = { id: r.id, chunks: [], received: 0, total: r.totalBytes, contentType: r.contentType };
      this.binaryPending.get(r.id)?.onProgress?.(0, r.totalBytes);
      return;
    }

    if (type === "binary-end") {
      // Buyer side: all chunks received — assemble into a Blob and resolve.
      const r = msg as unknown as { id: string };
      const t = this.binaryTransfer;
      if (t && t.id === r.id) {
        const blob = new Blob(t.chunks as BlobPart[], { type: t.contentType || "video/mp4" });
        this.binaryPending.get(r.id)?.resolve(blob);
        this.binaryPending.delete(r.id);
        this.binaryTransfer = null;
      }
      return;
    }

    if (type === "binary-error") {
      const r = msg as unknown as { id: string; error: string };
      this.binaryPending.get(r.id)?.reject(new Error(r.error));
      this.binaryPending.delete(r.id);
      if (this.binaryTransfer?.id === r.id) this.binaryTransfer = null;
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

  // ── Worker: serve a binary streaming request (e.g. a test video) ───────────

  private async serveBinaryRequest(id: string, url: string) {
    this.log(`→ [stream] GET ${url}`, "info");
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        credentials: "omit",
        cache: "no-store",
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const contentType = res.headers.get("content-type") || "video/mp4";
      const totalBytes = Number(res.headers.get("content-length") ?? 0);
      this.dc?.send(JSON.stringify({ type: "binary-start", id, contentType, totalBytes }));

      const reader = res.body.getReader();
      let sent = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          await this.sendBinaryBytes(value);
          sent += value.byteLength;
          this.onStats({ requests: 0, bytes: value.byteLength });
        }
      }

      this.dc?.send(JSON.stringify({ type: "binary-end", id }));
      this.onStats({ requests: 1, bytes: 0 });
      this.log(`← [stream] ${url} — ${sent} bytes streamed ✓`, "success");
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      this.dc?.send(JSON.stringify({ type: "binary-error", id, error }));
      this.log(`✗ [stream] ${url} — ${error}`, "error");
    }
  }

  /** Splits a chunk into DataChannel-safe pieces and applies backpressure so a
   *  large file (e.g. a 20 MB test video) never floods the SCTP send buffer. */
  private async sendBinaryBytes(data: Uint8Array) {
    const PIECE = 16 * 1024;
    for (let offset = 0; offset < data.byteLength; offset += PIECE) {
      await this.waitForBufferedAmountLow();
      const dc = this.dc;
      if (!dc || dc.readyState !== "open") throw new Error("Tunnel closed mid-transfer");
      dc.send(data.slice(offset, offset + PIECE));
    }
  }

  private waitForBufferedAmountLow(): Promise<void> {
    const dc = this.dc;
    if (!dc || dc.bufferedAmount < 1_000_000) return Promise.resolve();
    return new Promise((resolve) => {
      dc.bufferedAmountLowThreshold = 262_144;
      const handler = () => {
        dc.removeEventListener("bufferedamountlow", handler);
        resolve();
      };
      dc.addEventListener("bufferedamountlow", handler);
    });
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

  // ── Buyer: fetch a binary resource (e.g. a test video) via the Worker ──────

  fetchBinary(url: string, onProgress?: BinaryProgress): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (this.dc?.readyState !== "open") {
        reject(new Error("Tunnel not connected"));
        return;
      }
      const id = Math.random().toString(36).slice(2, 10);
      this.binaryPending.set(id, { resolve, reject, onProgress });
      this.dc.send(JSON.stringify({ type: "binary-request", id, url }));
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
    for (const p of this.binaryPending.values()) p.reject(new Error("Tunnel closed"));
    this.binaryPending.clear();
    this.binaryTransfer = null;
    try { this.dc?.close(); } catch { /* ignore */ }
    try { this.pc?.close(); } catch { /* ignore */ }
    this.dc = null;
    this.pc = null;
    this.setPhase("closed");
  }
}
