import { Router } from "express";
import { handleWebhook, verifyWebhook } from "../controllers/webhook.controller.js";
import { verifyWebhookSignature } from "../middlewares/verify.webhook.signature.middleware.js";

const router = Router();

router.get('/webhook', verifyWebhook);
router.post('/webhook', verifyWebhookSignature, handleWebhook); // You might want to handle POST requests as well

export default router;