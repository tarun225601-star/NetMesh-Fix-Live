/**
 * WebRTC Signaling Server
 *
 * Pairs a Worker (answerer) with a Buyer (offerer) and relays
 * offer / answer / ICE-candidate messages between them.
 *
 * Transport: plain WebSocket, mounted at /api/ws/signal
 * Query params:
 *   ?role=worker            → registers a new session, receives { type:'registered', sessionId }
 *   ?role=buyer&session=ID  → joins an existing session
 */

import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import { logger } from "./lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

type Role = "worker" | "buyer";

interface Session {
  id: string;
  worker: WebSocket | null;
  buyer: WebSocket | null;
  createdAt: Date;
}

type SignalMsg = { type: string } & Record<string, unknown>;

// ── In-memory session store ───────────────────────────────────────────────────

const sessions = new Map<string, Session>();

// Remove stale sessions (worker gone > 10 min) every minute
setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [id, s] of sessions) {
    if (!s.worker && s.createdAt.getTime() < cutoff) {
      sessions.delete(id);
    }
  }
}, 60_000);

// ── Helpers ───────────────────────────────────────────────────────────────────

const ADJECTIVES = ["ALPHA", "BETA", "GAMMA", "DELTA", "ECHO", "FOXTROT", "GOLF", "HOTEL"];

function generateSessionId(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `${adj}-${num}`;
}

function send(ws: WebSocket | null, msg: SignalMsg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function parse(data: Buffer | string): SignalMsg | null {
  try {
    return JSON.parse(data.toString()) as SignalMsg;
  } catch {
    return null;
  }
}

// ── Signal server factory ─────────────────────────────────────────────────────

export function createSignalServer(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const rawUrl = req.url ?? "/";
    // Strip /api prefix that comes through the Vite proxy
    const url = new URL(rawUrl.replace(/^\/api/, "") || "/", "http://localhost");
    const role = url.searchParams.get("role") as Role | null;
    const joinId = url.searchParams.get("session");

    let sessionId: string | null = null;
    let myRole: Role | null = null;

    // ── Worker registers ───────────────────────────────────────────────────────
    if (role === "worker") {
      // Keep generating until we have a unique ID
      let id = generateSessionId();
      while (sessions.has(id)) id = generateSessionId();

      sessionId = id;
      myRole = "worker";
      sessions.set(id, { id, worker: ws, buyer: null, createdAt: new Date() });
      send(ws, { type: "registered", sessionId: id });
      logger.info({ sessionId: id }, "Worker registered");
    }

    // ── Buyer joins ────────────────────────────────────────────────────────────
    else if (role === "buyer" && joinId) {
      const session = sessions.get(joinId.toUpperCase());
      if (!session) {
        send(ws, { type: "error", message: "Session not found — check the code and try again" });
        ws.close();
        return;
      }
      if (!session.worker || session.worker.readyState !== WebSocket.OPEN) {
        send(ws, { type: "error", message: "Worker is offline" });
        ws.close();
        return;
      }
      session.buyer = ws;
      sessionId = session.id;
      myRole = "buyer";
      send(ws, { type: "joined", sessionId: session.id });
      send(session.worker, { type: "buyer-joined" });
      logger.info({ sessionId: session.id }, "Buyer joined");
    }

    // ── Unknown / bad params ───────────────────────────────────────────────────
    else {
      send(ws, { type: "error", message: "Invalid role or missing session param" });
      ws.close();
      return;
    }

    // ── Message relay ──────────────────────────────────────────────────────────
    ws.on("message", (data: Buffer) => {
      if (!sessionId || !myRole) return;
      const session = sessions.get(sessionId);
      if (!session) return;

      const msg = parse(data);
      if (!msg) return;

      const { type } = msg;

      // Buyer → Worker: offer
      if (myRole === "buyer" && type === "offer") {
        send(session.worker, msg);
        return;
      }
      // Worker → Buyer: answer
      if (myRole === "worker" && type === "answer") {
        send(session.buyer, msg);
        return;
      }
      // Either side: ICE candidate → other side
      if (type === "ice") {
        const target = myRole === "worker" ? session.buyer : session.worker;
        send(target, msg);
        return;
      }
    });

    // ── Disconnect handling ────────────────────────────────────────────────────
    ws.on("close", () => {
      if (!sessionId || !myRole) return;
      const session = sessions.get(sessionId);
      if (!session) return;

      if (myRole === "worker") {
        send(session.buyer, { type: "worker-disconnected" });
        sessions.delete(sessionId);
        logger.info({ sessionId }, "Worker disconnected — session removed");
      } else {
        session.buyer = null;
        send(session.worker, { type: "buyer-disconnected" });
        logger.info({ sessionId }, "Buyer disconnected");
      }
    });

    ws.on("error", (err) => logger.error({ err, sessionId }, "WebSocket error"));
  });

  return wss;
}

// ── REST helpers ──────────────────────────────────────────────────────────────

export function getSessionSummaries() {
  return Array.from(sessions.values()).map((s) => ({
    id: s.id,
    workerOnline: !!s.worker && s.worker.readyState === WebSocket.OPEN,
    buyerOnline: !!s.buyer && s.buyer.readyState === WebSocket.OPEN,
    createdAt: s.createdAt.toISOString(),
  }));
}
