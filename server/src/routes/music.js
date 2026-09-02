import { Router } from "express";
import {
  getTracks,
  searchTracks,
  searchMusicAlbums,
  relatedTracks,
  getMusicGenres,
  getLyrics,
} from "../controllers/musicController.js";
import { streamTrack } from "../controllers/streamController.js";

const router = Router();

// Static paths above any future /music/:id, the same rule as the titles router.
router.get("/genres", getMusicGenres);
router.get("/search", searchTracks);
router.get("/albums", searchMusicAlbums);
router.get("/related", relatedTracks);
router.get("/lyrics", getLyrics);
router.get("/tracks", getTracks);

// The audio itself. HEAD as well as GET: some players ask before they play.
router.get("/stream/:id", streamTrack);
router.head("/stream/:id", streamTrack);

export default router;
