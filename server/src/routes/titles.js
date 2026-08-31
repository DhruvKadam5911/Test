import { Router } from "express";
import {
  getTitles,
  getTrending,
  searchTitles,
  getGenreList,
  getTitleById,
  getPlaybackUrl,
} from "../controllers/titlesController.js";

const router = Router();

router.get("/", getTitles);
// Every static path must stay above "/:id" — declared after it, Express matches
// them as an id instead.
router.get("/trending", getTrending);
router.get("/search", searchTitles);
router.get("/genres", getGenreList);
router.get("/:id", getTitleById);
router.get("/:id/playback", getPlaybackUrl);

export default router;
