import { Router } from "express";
import { refreshCatalog } from "../controllers/adminController.js";

const router = Router();

// GET so Vercel Cron can call it; guarded by CRON_SECRET in the controller.
router.get("/refresh", refreshCatalog);

export default router;
