import { createServer } from "http";
import app from "./app";
import { createSignalServer } from "./signal";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = createServer(app);

// ── WebSocket signaling ───────────────────────────────────────────────────────
const wss = createSignalServer();

server.on("upgrade", (req, socket, head) => {
  const url = req.url ?? "";
  // Accept upgrades at /api/ws/signal (routed through the Vite proxy in dev)
  if (url.startsWith("/api/ws/signal") || url.startsWith("/ws/signal")) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

// ── Listen ────────────────────────────────────────────────────────────────────
server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
