import { Router } from "express";
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { validateSchema } from "../middlewares/validator.middleware.js";
import { listContacts, getContact, createContact, updateContact, deleteContact } from "../controllers/contact.controller.js";
import { createContactSchema, updateContactSchema } from "../schemas/contact.schema.js";

const router = Router();

router.get('/contacts', authRequired, listContacts);
router.get('/contacts/:id', authRequired, getContact);
router.post('/contacts', authRequired, validateSchema(createContactSchema), createContact);
router.patch('/contacts/:id', authRequired, validateSchema(updateContactSchema), updateContact);
router.delete('/contacts/:id', authRequired, deleteContact);

export default router;
