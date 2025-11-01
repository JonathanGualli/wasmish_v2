import { Router } from "express";
import { login, logout, profile, register, verifyToken } from "../controllers/auth.controller.js";
import { validateSchema } from "../middlewares/validator.middleware.js";
import { loginSchema, registerSchema } from "../schemas/auth.schema.js";
import { authRequired } from "../middlewares/validate.token.middleware.js";

const router = Router();

router.post('/register', validateSchema(registerSchema), register);
router.post('/login', validateSchema(loginSchema), login); // Assuming login uses the same schema for simplicity
router.post('/logout', logout);
router.get('/verify', verifyToken)

router.get('/profile', authRequired, profile)

export default router;