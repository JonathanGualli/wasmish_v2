import { Router } from "express";
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { validateSchema } from "../middlewares/validator.middleware.js";
import { listTags, createTag, renameTag, deleteTag } from "../controllers/tag.controller.js";
import { tagSchema } from "../schemas/tag.schema.js";
import { requirePermission } from "../middlewares/require.permission.middleware.js";

const router = Router();

router.get('/tags', authRequired, listTags);
router.post('/tags', authRequired, requirePermission('tags.manage'), validateSchema(tagSchema), createTag);
router.patch('/tags/:id', authRequired, requirePermission('tags.manage'), validateSchema(tagSchema), renameTag);
router.delete('/tags/:id', authRequired, requirePermission('tags.manage'), deleteTag);

export default router;
