import mongoose from "mongoose";
import Tag from "../models/tag.model.js";
import { cleanTagName, tagKey } from "../utils/contact.tags.js";

// Lo que comparten los controllers de etiquetas, de contactos y la
// importación: comprobar que unas etiquetas son de la cuenta y crearlas por
// nombre sin duplicar.

/**
 * Los ids como ObjectId, si todos son etiquetas de la cuenta. `null` si alguno
 * no lo es: un id ajeno pondría en el contacto una etiqueta que nadie de la
 * cuenta ve ni puede quitar.
 */
export const resolveOwnedTagIds = async (userId, ids = []) => {
    const uniqueIds = [...new Set(ids.map(String))];
    if (uniqueIds.length === 0) return [];
    if (!uniqueIds.every(id => mongoose.isValidObjectId(id))) return null;

    const owned = await Tag.find({ _id: { $in: uniqueIds }, userId }).select('_id').lean();
    return owned.length === uniqueIds.length ? owned.map(tag => tag._id) : null;
};

/**
 * Las etiquetas con esos nombres, creando las que falten: un `Map` de su
 * `tagKey` a la etiqueta. Se hace con upserts sobre el índice único, así que
 * dos importaciones a la vez no crean la misma dos veces.
 */
export const findOrCreateTags = async (userId, names = []) => {
    const nameByKey = new Map();
    for (const name of names) {
        const key = tagKey(name);
        if (key && !nameByKey.has(key)) nameByKey.set(key, cleanTagName(name));
    }
    if (nameByKey.size === 0) return new Map();

    try {
        await Tag.bulkWrite([...nameByKey].map(([key, name]) => ({
            updateOne: { filter: { userId, key }, update: { $setOnInsert: { name } }, upsert: true },
        })), { ordered: false });
    } catch (error) {
        // Otro upsert de la misma etiqueta a la vez: ya existe, que es lo que se quería.
        if (error.code !== 11000) throw error;
    }

    const tags = await Tag.find({ userId, key: { $in: [...nameByKey.keys()] } }).lean();
    return new Map(tags.map(tag => [tag.key, tag]));
};
