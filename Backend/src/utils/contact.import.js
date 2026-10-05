// La importación de contactos, pura: de una fila del archivo a un contacto
// limpio, y de todas las filas a un plan (qué se crea, qué se completa, qué no
// cambia). La comparten la vista previa y la importación, para que lo que se
// importa sea lo que se revisó. Las filas llegan ya emparejadas a los campos
// de Wasmish (lo hace el navegador), con su número de fila del Excel.

import { parsePhoneNumberFromString, validatePhoneNumberLength, isSupportedCountry } from 'libphonenumber-js/max';
import { z } from 'zod';
import { MAX_TAGS_PER_CONTACT, splitTagCell, tagKey } from './contact.tags.js';

export const IMPORT_MAX_ROWS = 10000;
export const IMPORT_BATCH_MAX = 500;

/** Los campos de texto del contacto y su máximo (los mismos que el formulario). */
export const IMPORT_TEXT_FIELDS = { name: 80, email: 254, company: 80, notes: 1000 };

export const isImportCountry = (country) => typeof country === 'string' && isSupportedCountry(country);

const digitCount = (text) => text.replace(/\D/g, '').length;

/**
 * El teléfono como lo guarda Wasmish (solo dígitos, con código de país), o
 * `{ error }`. `country` es el país de los números que vienen sin código
 * («0991234567» con EC → 593991234567); los que lo traen se respetan.
 * `warning` avisa de un fijo: es válido, pero puede no tener WhatsApp.
 */
export const normalizeImportPhone = (raw, country) => {
    const text = raw === null || raw === undefined ? '' : String(raw).trim();
    if (!text) return { error: 'Sin teléfono.' };
    // Excel guarda un número largo como «5,93991E+11» y pierde los últimos
    // dígitos: no hay forma de recuperarlo.
    if (/\d[.,]?\d*e\+\d+/i.test(text)) {
        return { error: `«${text}»: Excel lo convirtió en notación científica y perdió dígitos. Pon la columna como texto y escríbelo otra vez.` };
    }

    const phone = parsePhoneNumberFromString(text, country);
    if (phone?.isValid()) {
        const type = phone.getType();
        return {
            phone: phone.number.slice(1),
            warning: type === 'FIXED_LINE' ? `«${text}» parece un teléfono fijo: puede que no tenga WhatsApp.` : null,
        };
    }

    const reason = validatePhoneNumberLength(text, country);
    if (reason === 'TOO_SHORT') return { error: `«${text}» tiene ${digitCount(text)} dígitos: le faltan.` };
    if (reason === 'TOO_LONG') return { error: `«${text}» tiene ${digitCount(text)} dígitos: le sobran.` };
    if (reason === 'NOT_A_NUMBER' || !digitCount(text)) return { error: `«${text}» no es un número de teléfono.` };
    return { error: `«${text}» no es un número válido.` };
};

const toText = (value) => (value === null || value === undefined ? '' : String(value));

/** Una línea: sin saltos ni espacios de más. Las notas sí conservan los saltos. */
const cleanLine = (value) => toText(value).replace(/\s+/g, ' ').trim();

const emailSchema = z.email();

const FIELD_LABEL = { name: 'El nombre', email: 'El email', company: 'La empresa', notes: 'La nota' };

/**
 * Una fila del archivo, limpia. Solo el teléfono impide importarla
 * (`errors`); lo demás se descarta o se recorta y queda como aviso
 * (`warnings`): perder un contacto por un email mal escrito sería peor.
 */
export const cleanImportRow = (row, country) => {
    const errors = [];
    const warnings = [];
    const fields = {};

    const phoneResult = normalizeImportPhone(row.phone, country);
    if (phoneResult.error) errors.push(phoneResult.error);
    if (phoneResult.warning) warnings.push(phoneResult.warning);

    const values = {
        name: [cleanLine(row.name), cleanLine(row.lastName)].filter(Boolean).join(' '),
        email: cleanLine(row.email).toLowerCase(),
        company: cleanLine(row.company),
        notes: toText(row.notes).trim(),
    };
    for (const [field, max] of Object.entries(IMPORT_TEXT_FIELDS)) {
        const value = values[field];
        if (!value) continue;
        if (field === 'email' && !emailSchema.safeParse(value).success) {
            warnings.push(`«${value}» no es un email válido: se importa sin email.`);
            continue;
        }
        if (value.length > max) warnings.push(`${FIELD_LABEL[field]} pasa de ${max} caracteres: se recorta.`);
        fields[field] = value.slice(0, max);
    }

    return { row: row.row, phone: phoneResult.phone ?? null, fields, tagNames: splitTagCell(row.tags), errors, warnings };
};

/**
 * Junta las filas con el mismo teléfono: gana el primer valor no vacío de cada
 * campo y las etiquetas se suman. Devuelve una entrada por teléfono, en el
 * orden en que aparecieron, con todas sus filas.
 */
const mergeByPhone = (cleanRows) => {
    const byPhone = new Map();
    for (const row of cleanRows) {
        const entry = byPhone.get(row.phone);
        if (!entry) {
            byPhone.set(row.phone, { phone: row.phone, rows: [row.row], fields: { ...row.fields }, tagNames: [...row.tagNames] });
            continue;
        }
        entry.rows.push(row.row);
        for (const [field, value] of Object.entries(row.fields)) entry.fields[field] ??= value;
        entry.tagNames.push(...row.tagNames);
    }
    return [...byPhone.values()];
};

/** Las etiquetas únicas por `tagKey`, conservando el primer nombre. */
const uniqueTagNames = (names) => {
    const byKey = new Map();
    for (const name of names) {
        const key = tagKey(name);
        if (key && !byKey.has(key)) byKey.set(key, name);
    }
    return byKey;
};

/**
 * El plan de la importación. `existingByPhone` son los contactos de la cuenta
 * con esos teléfonos, cada uno con `tagKeys` (las claves de sus etiquetas).
 * A un contacto existente solo se le rellenan los campos vacíos y se le
 * añaden etiquetas, sin pasar de MAX_TAGS_PER_CONTACT; la baja de publicidad
 * no se toca nunca.
 *
 * Cada entrada: `{ action: 'create' | 'update' | 'unchanged', phone, rows,
 * fields, tagNames, contactId? }`. En `update`, `fields` y `tagNames` son solo
 * lo que se añade.
 */
export const planImportRows = (rows, { country, extraTagNames = [], existingByPhone = new Map() }) => {
    const cleanRows = rows.map(row => cleanImportRow(row, country));
    const issues = [];
    for (const row of cleanRows) {
        row.errors.forEach(message => issues.push({ row: row.row, type: 'error', message }));
        row.warnings.forEach(message => issues.push({ row: row.row, type: 'warning', message }));
    }

    const valid = cleanRows.filter(row => row.errors.length === 0);
    const merged = mergeByPhone(valid);
    let optedOutExisting = 0;

    const entries = merged.map(entry => {
        const wanted = uniqueTagNames([...entry.tagNames, ...extraTagNames]);
        const existing = existingByPhone.get(entry.phone);

        if (!existing) {
            const tagNames = [...wanted.values()];
            if (tagNames.length > MAX_TAGS_PER_CONTACT) {
                issues.push({ row: entry.rows[0], type: 'warning', message: `Lleva más de ${MAX_TAGS_PER_CONTACT} etiquetas: se ponen las primeras.` });
            }
            return { action: 'create', phone: entry.phone, rows: entry.rows, fields: entry.fields, tagNames: tagNames.slice(0, MAX_TAGS_PER_CONTACT) };
        }

        if (existing.marketingOptOut) optedOutExisting += 1;
        const fields = Object.fromEntries(Object.entries(entry.fields).filter(([field]) => !existing[field]));
        const room = MAX_TAGS_PER_CONTACT - existing.tagKeys.length;
        const newTags = [...wanted].filter(([key]) => !existing.tagKeys.includes(key)).map(([, name]) => name);
        if (newTags.length > room) {
            issues.push({ row: entry.rows[0], type: 'warning', message: `Ya tiene ${existing.tagKeys.length} etiquetas: no caben todas las del archivo.` });
        }
        const tagNames = newTags.slice(0, Math.max(room, 0));
        const changed = Object.keys(fields).length > 0 || tagNames.length > 0;
        return { action: changed ? 'update' : 'unchanged', phone: entry.phone, rows: entry.rows, fields, tagNames, contactId: existing._id };
    });

    const count = (action) => entries.filter(e => e.action === action).length;
    return {
        entries,
        issues: issues.sort((a, b) => a.row - b.row),
        summary: {
            rows: rows.length,
            create: count('create'),
            update: count('update'),
            unchanged: count('unchanged'),
            // Las filas que se juntaron con otra del mismo teléfono.
            duplicates: valid.length - merged.length,
            errors: cleanRows.filter(row => row.errors.length > 0).length,
            warnings: new Set(issues.filter(issue => issue.type === 'warning').map(issue => issue.row)).size,
            optedOutExisting,
        },
    };
};
