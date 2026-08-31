import { Router } from "express";
import { refreshCatalog, dedupe, reindex } from "../controllers/adminController.js";

const router = Router();

// GET so Vercel Cron can call it; guarded by CRON_SECRET in the controller.
router.get("/refresh", refreshCatalog);

// Dry run unless ?apply=true. Same CRON_SECRET guard.
router.get("/dedupe", dedupe);

// One-off: installs pg_trgm and the trigram index search depends on.
router.get("/reindex", reindex);

export default router;
