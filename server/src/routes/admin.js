import { Router } from "express";
import { refreshCatalog, dedupe, reindex, removeSeed, refreshMusic } from "../controllers/adminController.js";

const router = Router();

// GET so Vercel Cron can call it; guarded by CRON_SECRET in the controller.
router.get("/refresh", refreshCatalog);
router.get("/refresh-music", refreshMusic);

// Dry run unless ?apply=true. Same CRON_SECRET guard.
router.get("/dedupe", dedupe);

// One-off: installs pg_trgm and the trigram index search depends on.
router.get("/reindex", reindex);

// One-off: drops the demo titles the project shipped with. Dry run unless ?apply=true.
router.get("/remove-seed", removeSeed);

export default router;
