import { Router } from "express";
import { getSessionSummaries } from "../signal";

const router = Router();

/** GET /api/sessions — list active P2P sessions */
router.get("/", (_req, res) => {
  res.json({ sessions: getSessionSummaries() });
});

export default router;
