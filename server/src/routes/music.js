import { Router } from "express";
import { getTracks, searchTracks, searchMusicAlbums, relatedTracks, getMusicGenres } from "../controllers/musicController.js";

const router = Router();

// Static paths above any future /music/:id, the same rule as the titles router.
router.get("/genres", getMusicGenres);
router.get("/search", searchTracks);
router.get("/albums", searchMusicAlbums);
router.get("/related", relatedTracks);
router.get("/tracks", getTracks);

export default router;
