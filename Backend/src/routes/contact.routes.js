import { Router } from "express";
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { validateSchema } from "../middlewares/validator.middleware.js";
import { listContacts, getContact, createContact, updateContact, deleteContact, bulkTagContacts, summarizeSelectionTags } from "../controllers/contact.controller.js";
import { bulkTagContactsSchema, createContactSchema, tagSelectionSummarySchema, updateContactSchema } from "../schemas/contact.schema.js";
import { previewImport, importContacts } from "../controllers/contact.import.controller.js";
import { importContactsSchema, importPreviewSchema } from "../schemas/contact.import.schema.js";
import { requirePermission } from "../middlewares/require.permission.middleware.js";
import { addContactNote, editContactNote, removeContactNote } from "../controllers/contact.note.controller.js";
import { contactNoteSchema } from "../schemas/contact.note.schema.js";

const router = Router();

router.get('/contacts', authRequired, listContacts);
router.get('/contacts/:id', authRequired, getContact);
router.post('/contacts', authRequired, validateSchema(createContactSchema), createContact);
router.post('/contacts/tags', authRequired, requirePermission('tags.manage'), validateSchema(bulkTagContactsSchema), bulkTagContacts);
router.post('/contacts/tags/summary', authRequired, validateSchema(tagSelectionSummarySchema), summarizeSelectionTags);
router.post('/contacts/import/preview', authRequired, requirePermission('contacts.import'), validateSchema(importPreviewSchema), previewImport);
router.post('/contacts/import', authRequired, requirePermission('contacts.import'), validateSchema(importContactsSchema), importContacts);
router.patch('/contacts/:id', authRequired, validateSchema(updateContactSchema), updateContact);
router.delete('/contacts/:id', authRequired, requirePermission('contacts.delete'), deleteContact);
// Las notas: cualquiera de la cuenta añade; editar y borrar, el autor o owner y admin (`canEditNote`).
router.post('/contacts/:id/notes', authRequired, validateSchema(contactNoteSchema), addContactNote);
router.patch('/contacts/:id/notes/:noteId', authRequired, validateSchema(contactNoteSchema), editContactNote);
router.delete('/contacts/:id/notes/:noteId', authRequired, removeContactNote);

export default router;
