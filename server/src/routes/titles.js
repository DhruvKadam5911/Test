import { Router } from "express";
import { getTitles, getTrending, getTitleById, getPlaybackUrl } from "../controllers/titlesController.js";

const router = Router();

router.get("/", getTitles);
router.get("/trending", getTrending);
router.get("/:id", getTitleById);
router.get("/:id/playback", getPlaybackUrl);

export default router;
