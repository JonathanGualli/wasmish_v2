import mongoose from "mongoose";
import Contact from "../models/contact.model.js";
import Tag from "../models/tag.model.js";
import { normalizeImportPhone, pickImportSample, planImportRows } from "../utils/contact.import.js";
import { TAG_NAME_MAX, cleanTagName, tagKey } from "../utils/contact.tags.js";
import { findOrCreateTags } from "../services/tag.service.js";
import { notifyContactsChanged } from "./contact.controller.js";
import ContactNote from "../models/contact.note.model.js";
import { importKeyFor } from "../utils/contact.notes.js";
import { applyAgendaNames } from "../services/agenda.service.js";

// ---------------------------------------------------------------------------
// Importar contactos. El navegador lee el archivo y empareja las columnas; aquí
// llegan las filas ya emparejadas. La vista previa y la importación hacen el
// mismo plan (`planImportRows`): lo que se importa es lo que se revisó.
// ---------------------------------------------------------------------------

const SAMPLE_SIZE = 3;

const sendImportError = (res, status, message) => res.status(status).json([{ message }]);

/** «Etiquetas para todos», limpias; las que no caben en una etiqueta se ignoran. */
const cleanExtraTags = (names = []) =>
    names.map(cleanTagName).filter(name => name && name.length <= TAG_NAME_MAX);

/**
 * Los contactos de la cuenta con esos teléfonos, por teléfono, cada uno con
 * sus etiquetas: las claves (el plan compara por clave, no por id) y los
 * nombres (la muestra los enseña). Y sus notas: los textos, para no repetir la
 * del archivo, y cuántas tiene.
 */
const loadExistingByPhone = async (userId, phones) => {
    const [contacts, tags] = await Promise.all([
        Contact.find({ userId, phone: { $in: phones } })
            .select('phone name email company tags marketingOptOut').lean(),
        Tag.find({ userId }).select('key name').lean(),
    ]);
    const notes = contacts.length === 0 ? [] : await ContactNote.aggregate([
        { $match: { userId, contactId: { $in: contacts.map(contact => contact._id) } } },
        { $group: { _id: '$contactId', texts: { $push: '$text' }, count: { $sum: 1 } } },
    ]);
    const notesByContact = new Map(notes.map(group => [String(group._id), group]));
    const tagById = new Map(tags.map(tag => [String(tag._id), tag]));
    return new Map(contacts.map(contact => {
        const contactTags = (contact.tags ?? []).map(id => tagById.get(String(id))).filter(Boolean);
        const contactNotes = notesByContact.get(String(contact._id));
        return [contact.phone, {
            ...contact,
            tagKeys: contactTags.map(tag => tag.key),
            tagNames: contactTags.map(tag => tag.name),
            noteTexts: contactNotes?.texts ?? [],
            noteCount: contactNotes?.count ?? 0,
        }];
    }));
};

/**
 * Las notas del archivo, a nombre de quien importa. Por `importKey`: si otra
 * importación a la vez ya la creó, el índice único lo frena (E11000) y aquí no
 * se repite (revisión de Codex del plan).
 */
const insertImportNotes = async (userId, author, notes) => {
    if (notes.length === 0) return;
    const operations = notes.map(({ contactId, text }) => {
        const importKey = importKeyFor(text);
        return {
            updateOne: {
                filter: { userId, contactId, importKey },
                update: { $setOnInsert: {
                    text, source: 'import', authorId: author.id, authorName: author.name,
                    createdAt: new Date(), editedAt: null,
                } },
                upsert: true,
            },
        };
    });
    try {
        await ContactNote.collection.bulkWrite(operations, { ordered: false });
    } catch (error) {
        const writeErrors = error.writeErrors ?? [];
        if (writeErrors.length === 0 || writeErrors.some(e => e.code !== 11000)) throw error;
    }
};

const buildPlan = async (userId, { rows, country, extraTagNames }) => {
    const phones = [...new Set(rows.map(row => normalizeImportPhone(row.phone, country).phone).filter(Boolean))];
    const existingByPhone = await loadExistingByPhone(userId, phones);
    const plan = planImportRows(rows, { country, extraTagNames: cleanExtraTags(extraTagNames ?? []), existingByPhone });
    return { plan, existingByPhone };
};

// Un upsert de pipeline no pasa por Mongoose: lo que un contacto nuevo lleva
// por defecto se pone aquí. Un contacto nuevo es el que aún no tiene createdAt.
const isNew = { $eq: [{ $type: '$createdAt' }, 'missing'] };
const fillIfEmpty = (field, value) => ({ $ifNull: [`$${field}`, value] });

/**
 * Crear o completar un contacto en una sola operación, por teléfono. Cada
 * campo se rellena solo si está vacío EN ESE MOMENTO (no cuando se hizo el
 * plan), así que un cambio hecho a mano mientras tanto no se pisa; las
 * etiquetas se suman. La baja de publicidad no se toca.
 */
const importUpsert = (userId, { phone, fields }, tagIds) => ({
    updateOne: {
        filter: { userId, phone },
        update: [{
            $set: {
                ...Object.fromEntries(Object.entries(fields).map(([field, value]) => [field, fillIfEmpty(field, value)])),
                tags: { $setUnion: [{ $ifNull: ['$tags', []] }, tagIds] },
                source: { $cond: [isNew, 'import', '$source'] },
                marketingOptOut: { $cond: [isNew, false, '$marketingOptOut'] },
                createdAt: fillIfEmpty('createdAt', '$$NOW'),
                updatedAt: '$$NOW',
            },
        }],
        upsert: true,
    },
});

/**
 * Lanza los upserts. Si un webhook creó uno de esos números entre medias, el
 * upsert choca con el índice único (E11000): se repite, y entonces completa.
 */
const runUpserts = async (operations) => {
    if (operations.length === 0) return { upsertedCount: 0, modifiedCount: 0 };
    try {
        return await Contact.collection.bulkWrite(operations, { ordered: false });
    } catch (error) {
        const writeErrors = error.writeErrors ?? [];
        if (writeErrors.length === 0 || writeErrors.some(e => e.code !== 11000)) throw error;
        const retried = await Contact.collection.bulkWrite(writeErrors.map(e => operations[e.index]), { ordered: false });
        return {
            upsertedCount: error.result.upsertedCount + retried.upsertedCount,
            modifiedCount: error.result.modifiedCount + retried.modifiedCount,
        };
    }
};

/**
 * El nombre de la agenda del celular a los contactos de la tanda que estén en
 * ella (ver services/agenda.service.js). Un fallo no deshace la importación: se
 * registra y el siguiente cambio de la agenda lo arregla.
 * @returns {Promise<number>} cuántos cambiaron.
 */
const applyImportAgendaNames = async (userId, phones) => {
    try {
        return await applyAgendaNames(userId, phones);
    } catch (error) {
        console.warn('No se pudo poner el nombre de la agenda a los importados:', { contactos: phones.length, error: error.message });
        return 0;
    }
};

/**
 * POST /contacts/import/preview — qué pasaría con el archivo entero, sin
 * escribir nada: conteos, errores y avisos por fila, y una muestra.
 *
 * `rowGroups` son las filas de cada contacto (las de un mismo teléfono van
 * juntas). El navegador arma las tandas con ellos: si un repetido cayera en
 * dos tandas, la segunda lo contaría como completado y las cifras del final
 * no cuadrarían con estas.
 */
export const previewImport = async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.auth.accountId);
        const { plan, existingByPhone } = await buildPlan(userId, req.body);
        return res.json({
            summary: plan.summary,
            issues: plan.issues,
            sample: pickImportSample(plan, existingByPhone, SAMPLE_SIZE),
            rowGroups: plan.entries.map(entry => entry.rows),
        });
    } catch (error) {
        return sendImportError(res, 500, error.message);
    }
};

/**
 * POST /contacts/import — una tanda (como mucho IMPORT_BATCH_MAX filas).
 * Repetirla no duplica nada: lo que ya está se queda igual. Devuelve los ids
 * de todos los contactos de la tanda (nuevos, completados y sin cambios), para
 * poder crear una campaña con ellos.
 */
export const importContacts = async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.auth.accountId);
        const { plan } = await buildPlan(userId, req.body);

        const toWrite = plan.entries.filter(entry => entry.action !== 'unchanged');
        const tagByKey = await findOrCreateTags(userId, toWrite.flatMap(entry => entry.tagNames));
        const result = await runUpserts(toWrite.map(entry =>
            importUpsert(userId, entry, entry.tagNames.map(name => tagByKey.get(tagKey(name))._id))));
        const named = await applyImportAgendaNames(userId, toWrite.map(entry => entry.phone));

        const contacts = await Contact.find({ userId, phone: { $in: plan.entries.map(entry => entry.phone) } }).select('_id phone').lean();
        const contactIdByPhone = new Map(contacts.map(contact => [contact.phone, contact._id]));
        await insertImportNotes(userId, { id: new mongoose.Types.ObjectId(req.auth.userId), name: req.auth.name },
            toWrite.filter(entry => entry.note && contactIdByPhone.has(entry.phone))
                .map(entry => ({ contactId: contactIdByPhone.get(entry.phone), text: entry.note })));
        const created = result.upsertedCount;
        // Uno que solo gana una nota también cuenta: su upsert le pone `updatedAt`.
        const updated = result.modifiedCount;
        if (created + updated + named > 0) notifyContactsChanged(userId);
        return res.json({
            summary: { ...plan.summary, created, updated, unchanged: plan.entries.length - created - updated },
            issues: plan.issues,
            contactIds: contacts.map(contact => String(contact._id)),
        });
    } catch (error) {
        return sendImportError(res, 500, error.message);
    }
};
