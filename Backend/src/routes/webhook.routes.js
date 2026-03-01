import { Router } from "express";
import { handleWebhook, verifyWebhook } from "../controllers/webhook.controller.js";

const router = Router();

router.get('/webhook', verifyWebhook);
router.post('/webhook', handleWebhook); // You might want to handle POST requests as well

export default router;