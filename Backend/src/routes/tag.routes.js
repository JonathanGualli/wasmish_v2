import { Router } from "express";
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { validateSchema } from "../middlewares/validator.middleware.js";
import { listTags, createTag, renameTag, deleteTag } from "../controllers/tag.controller.js";
import { tagSchema } from "../schemas/tag.schema.js";

const router = Router();

router.get('/tags', authRequired, listTags);
router.post('/tags', authRequired, validateSchema(tagSchema), createTag);
router.patch('/tags/:id', authRequired, validateSchema(tagSchema), renameTag);
router.delete('/tags/:id', authRequired, deleteTag);

export default router;
