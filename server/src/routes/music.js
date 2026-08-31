import { Router } from "express";
import { getTracks } from "../controllers/musicController.js";

const router = Router();

router.get("/tracks", getTracks);

export default router;
