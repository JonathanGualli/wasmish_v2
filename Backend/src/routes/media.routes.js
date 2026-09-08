import { Router } from "express";
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { getMedia } from "../controllers/media.controller.js";

const router = Router();

router.get('/media/:id', authRequired, getMedia);

export default router;
