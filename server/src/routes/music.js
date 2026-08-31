import { Router } from "express";
import { getTracks, getMusicGenres } from "../controllers/musicController.js";

const router = Router();

// Static path above nothing else here yet, but kept in the same order as the
// titles router so the convention survives a future /music/:id.
router.get("/genres", getMusicGenres);
router.get("/tracks", getTracks);

export default router;
