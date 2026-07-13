import { existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api", router);

// ── Frontend static files (Render Web Service deployment) ────────────────────
// After `sh build.sh`, the Vite output lands at:
//   artifacts/netmesh/dist/public/
// relative to the repo root.  __dirname here is artifacts/api-server/dist/
// (set by the esbuild banner), so we step two levels up to reach the root.
const staticDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../netmesh/dist/public",
);

if (existsSync(staticDir)) {
  // Serve assets (JS, CSS, images) with long-lived cache headers.
  app.use(
    express.static(staticDir, {
      maxAge: "1y",
      immutable: true,
    }),
  );

  // SPA catch-all: any path that doesn't match a real file returns index.html
  // so the React / wouter client-side router handles it.
  app.use((_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

export default app;
