import { Router } from "express";
import { updateProgress, getContinueWatching } from "../controllers/progressController.js";
import authenticateToken from "../middleware/auth.js";

const router = Router();

router.use(authenticateToken);

router.post("/", updateProgress);
router.get("/continue-watching", getContinueWatching);

export default router;
