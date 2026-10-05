import { Router } from "express";
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { validateSchema } from "../middlewares/validator.middleware.js";
import { listContacts, getContact, createContact, updateContact, deleteContact, bulkTagContacts } from "../controllers/contact.controller.js";
import { bulkTagContactsSchema, createContactSchema, updateContactSchema } from "../schemas/contact.schema.js";
import { previewImport, importContacts } from "../controllers/contact.import.controller.js";
import { importContactsSchema, importPreviewSchema } from "../schemas/contact.import.schema.js";

const router = Router();

router.get('/contacts', authRequired, listContacts);
router.get('/contacts/:id', authRequired, getContact);
router.post('/contacts', authRequired, validateSchema(createContactSchema), createContact);
router.post('/contacts/tags', authRequired, validateSchema(bulkTagContactsSchema), bulkTagContacts);
router.post('/contacts/import/preview', authRequired, validateSchema(importPreviewSchema), previewImport);
router.post('/contacts/import', authRequired, validateSchema(importContactsSchema), importContacts);
router.patch('/contacts/:id', authRequired, validateSchema(updateContactSchema), updateContact);
router.delete('/contacts/:id', authRequired, deleteContact);

export default router;
