import mongoose from "mongoose";
import Tag from "../models/tag.model.js";
import Contact from "../models/contact.model.js";
import { cleanTagName, tagKey } from "../utils/contact.tags.js";

// ---------------------------------------------------------------------------
// Las etiquetas de la cuenta: listarlas con cuántos contactos tienen, crearlas
// al vuelo, renombrarlas y borrarlas. Poner y quitar etiquetas a los
// contactos vive en contact.controller.js.
// ---------------------------------------------------------------------------

const sendTagError = (res, status, message, extra = {}) => res.status(status).json([{ message, ...extra }]);

const serializeTag = (tag, contactCount = 0) => ({ id: String(tag._id), name: tag.name, contactCount });

// Un id mal formado es una etiqueta que no existe: 404, no un CastError (500).
const findOwnedTag = (userId, id) =>
    mongoose.isValidObjectId(id) ? Tag.findOne({ _id: id, userId }) : null;

const countContacts = (userId, tagId) => Contact.countDocuments({ userId, tags: tagId });

// GET /tags — por nombre, sin distinguir mayúsculas ni tildes.
export const listTags = async (req, res) => {
    try {
        // aggregate no convierte tipos como find: el userId tiene que ir ya como ObjectId.
        const userId = new mongoose.Types.ObjectId(req.user.id);
        const [tags, counts] = await Promise.all([
            Tag.find({ userId }).collation({ locale: 'es', strength: 1 }).sort({ name: 1 }).lean(),
            Contact.aggregate([
                { $match: { userId, 'tags.0': { $exists: true } } },
                { $unwind: '$tags' },
                { $group: { _id: '$tags', count: { $sum: 1 } } },
            ]),
        ]);
        const countByTag = new Map(counts.map(c => [String(c._id), c.count]));
        return res.json({ tags: tags.map(tag => serializeTag(tag, countByTag.get(String(tag._id)) ?? 0)) });
    } catch (error) {
        return sendTagError(res, 500, error.message);
    }
};

/**
 * POST /tags — si ya hay una con ese nombre («vip» y «VIP» son la misma),
 * devuelve esa (200) en vez de fallar: el selector crea al escribir y no tiene
 * por qué saber si existía.
 */
export const createTag = async (req, res) => {
    const userId = req.user.id;
    const name = cleanTagName(req.body.name);
    const key = tagKey(name);
    try {
        const existing = await Tag.findOne({ userId, key }).lean();
        if (existing) return res.json(serializeTag(existing, await countContacts(userId, existing._id)));

        const tag = await Tag.create({ userId, name, key });
        return res.status(201).json(serializeTag(tag));
    } catch (error) {
        // La misma etiqueta creada a la vez desde otra pestaña.
        if (error.code === 11000) {
            const tag = await Tag.findOne({ userId, key }).lean();
            return res.json(serializeTag(tag, await countContacts(userId, tag._id)));
        }
        return sendTagError(res, 500, error.message);
    }
};

// PATCH /tags/:id — renombrar cambia en todos sus contactos a la vez (llevan el id).
export const renameTag = async (req, res) => {
    const userId = req.user.id;
    const name = cleanTagName(req.body.name);
    const key = tagKey(name);
    try {
        const tag = await findOwnedTag(userId, req.params.id);
        if (!tag) return sendTagError(res, 404, 'Etiqueta no encontrada');

        const clash = await Tag.findOne({ userId, key, _id: { $ne: tag._id } }).select('_id name').lean();
        if (clash) return sendTagError(res, 409, `Ya hay una etiqueta «${clash.name}»`, { field: 'name', tagId: String(clash._id) });

        tag.name = name;
        tag.key = key;
        await tag.save();
        return res.json(serializeTag(tag, await countContacts(userId, tag._id)));
    } catch (error) {
        if (error.code === 11000) return sendTagError(res, 409, 'Ya hay una etiqueta con ese nombre', { field: 'name' });
        return sendTagError(res, 500, error.message);
    }
};

// DELETE /tags/:id — se quita de sus contactos; los contactos no se tocan más.
export const deleteTag = async (req, res) => {
    const userId = req.user.id;
    try {
        const tag = await findOwnedTag(userId, req.params.id);
        if (!tag) return sendTagError(res, 404, 'Etiqueta no encontrada');

        const { modifiedCount } = await Contact.updateMany({ userId, tags: tag._id }, { $pull: { tags: tag._id } });
        await Tag.deleteOne({ _id: tag._id, userId });
        return res.json({ removedFrom: modifiedCount });
    } catch (error) {
        return sendTagError(res, 500, error.message);
    }
};
