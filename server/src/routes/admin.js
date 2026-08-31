import { Router } from "express";
import { refreshCatalog, dedupe } from "../controllers/adminController.js";

const router = Router();

// GET so Vercel Cron can call it; guarded by CRON_SECRET in the controller.
router.get("/refresh", refreshCatalog);

// Dry run unless ?apply=true. Same CRON_SECRET guard.
router.get("/dedupe", dedupe);

export default router;
