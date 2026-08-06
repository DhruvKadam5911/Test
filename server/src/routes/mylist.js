import { Router } from "express";
import { addToMyList, removeFromMyList, getMyList } from "../controllers/mylistController.js";
import authenticateToken from "../middleware/auth.js";

const router = Router();

router.use(authenticateToken);

router.post("/", addToMyList);
router.delete("/:titleId", removeFromMyList);
router.get("/", getMyList);

export default router;
