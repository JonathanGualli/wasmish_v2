import mongoose from "mongoose";
import Contact from "../models/contact.model.js";
import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import { hasContactIdentity, mergeContactUpdates, contactDisplayName } from "../utils/contact.identity.js";
import { pickContactFields, buildContactMatch, CONTACT_FILTERS } from "../utils/contact.query.js";
import { getWindowExpiry } from "../utils/whatsapp.window.js";
import { resolveMarketingPreference } from "../utils/marketing.preference.js";
import { MAX_TAGS_PER_CONTACT } from "../utils/contact.tags.js";
import { resolveOwnedTagIds } from "../services/tag.service.js";

// ---------------------------------------------------------------------------
// Contactos y su conversación. Lo usan los sitios por donde entra un número o
// un BSUID: el webhook, los dos envíos (texto y plantilla) y el alta manual.
// ---------------------------------------------------------------------------

// El BSUID primero: identifica a la persona aunque Meta no mande el teléfono.
export const findContactByIdentity = async (userId, { phone, waUserId }) => {
    if (waUserId) {
        const contact = await Contact.findOne({ userId, waUserId });
        if (contact) return contact;
    }
    return phone ? Contact.findOne({ userId, phone }) : null;
};

const applyContactUpdates = async (contact, incoming) => {
    const changes = mergeContactUpdates(contact, incoming);
    if (Object.keys(changes).length === 0) return contact;

    try {
        Object.assign(contact, changes);
        return await contact.save();
    } catch (error) {
        // El teléfono o el BSUID ya son de OTRO contacto de la cuenta (uno se creó
        // solo con teléfono y otro solo con BSUID). Fusionarlos no es algo que deba
        // decidir un webhook: se deja como está y el mensaje sigue su camino.
        if (error.code !== 11000) throw error;
        console.warn('Identificador ya usado por otro contacto; no se actualiza:', { contactId: String(contact._id) });
        return Contact.findById(contact._id);
    }
};

/**
 * Devuelve el contacto de esa identidad, creándolo si no existe, y le pone al
 * día lo que sabe WhatsApp de él (ver `mergeContactUpdates`).
 *
 * `name`, `source` y `referral` solo cuentan al crearlo, salvo `name`, que
 * además rellena el de un contacto que no tenga ninguno.
 */
export const resolveContact = async (userId, identity, { name = null, source = null, referral = null } = {}) => {
    if (!hasContactIdentity(identity)) {
        const error = new Error('El contacto necesita un teléfono o un BSUID');
        error.statusCode = 400;
        throw error;
    }

    const incoming = { ...identity, name };
    const existing = await findContactByIdentity(userId, identity);
    if (existing) return applyContactUpdates(existing, incoming);

    try {
        return await Contact.create({
            userId,
            phone: identity.phone ?? null,
            waUserId: identity.waUserId ?? null,
            username: identity.username ?? null,
            profileName: identity.profileName ?? null,
            name: name || null,
            source,
            referral,
        });
    } catch (error) {
        // Dos webhooks del mismo número nuevo a la vez: el índice único deja crear
        // solo a uno, y el otro usa el que ganó.
        if (error.code !== 11000) throw error;
        const created = await findContactByIdentity(userId, identity);
        if (!created) throw error;
        return applyContactUpdates(created, incoming);
    }
};

// Las conversaciones anteriores a los contactos no tienen contactId. Al tocarlas
// se enlazan, y el nombre que tenían pasa al contacto si este no tiene uno.
const linkConversation = async (conversation, contact) => {
    conversation.contactId = contact._id;
    if (!contact.name && conversation.contactName) {
        contact.name = conversation.contactName;
        await contact.save();
    }
};

/**
 * El contacto de una conversación que ya existe. Si es anterior a los contactos,
 * lo crea a partir de su teléfono y deja la conversación enlazada.
 */
export const getConversationContact = async (conversation) => {
    if (conversation.contactId) {
        const contact = await Contact.findOne({ _id: conversation.contactId, userId: conversation.userId });
        if (contact) return contact;
    }

    const contact = await resolveContact(
        conversation.userId,
        { phone: conversation.contactPhone },
        { name: conversation.contactName },
    );
    await linkConversation(conversation, contact);
    // Enlazar no es actividad de la conversación: no le cambia el updatedAt.
    await conversation.save({ timestamps: false });
    return contact;
};

/**
 * La conversación de un contacto, creándola si no existe. Puede volver con
 * cambios sin guardar: quien la llama le pone el último mensaje y la guarda.
 */
export const findOrCreateConversation = async ({ userId, contact, phoneNumberId }) => {
    let conversation = await Conversation.findOne({ userId, contactId: contact._id });

    if (!conversation && contact.phone) {
        conversation = await Conversation.findOne({ userId, contactPhone: contact.phone, contactId: null });
        if (conversation) await linkConversation(conversation, contact);
    }

    if (!conversation) {
        try {
            conversation = await Conversation.create({
                userId,
                contactId: contact._id,
                contactPhone: contact.phone,
                phoneNumberId,
                // 0, no 1: el webhook suma el mensaje entrante después, también
                // para la conversación recién creada.
                unreadCount: 0,
            });
        } catch (error) {
            // Mismo caso que en resolveContact: otra petición la creó a la vez.
            if (error.code !== 11000) throw error;
            conversation = await Conversation.findOne({ userId, contactId: contact._id });
            if (!conversation) throw error;
        }
    }

    // Meta revela el teléfono de alguien que escribió solo con su nombre de usuario.
    if (contact.phone && conversation.contactPhone !== contact.phone) {
        conversation.contactPhone = contact.phone;
    }

    return conversation;
};

/**
 * A quién va un envío: el contacto de la conversación, o el número del body
 * cuando se inicia una conversación nueva. En ese segundo caso el contacto no se
 * crea todavía: un envío que ni siquiera sale (plantilla inexistente, botón mal
 * puesto) no debe dejar contactos detrás.
 */
export const getSendingRecipient = (conversation, destinationNumber) =>
    conversation ? getConversationContact(conversation) : { phone: destinationNumber };

// La conversación donde se guarda un envío ya hecho (haya salido o no). Con
// `contact` (campaña) el contacto ya existe: no hay que resolverlo.
export const getSendingConversation = async ({ userId, conversation, contact = null, recipient, phoneNumberId, contactName, source }) => {
    if (conversation) return conversation;
    const target = contact ?? await resolveContact(userId, recipient, { name: contactName, source });
    return findOrCreateConversation({ userId, contact: target, phoneNumberId });
};

/**
 * Aplica una baja o un alta de publicidad (ver `resolveMarketingPreference`).
 * Devuelve el contacto actualizado si cambió `marketingOptOut` —que es cuando
 * hay que avisar a la UI— y null si no.
 *
 * El update repite la condición de fecha en el filtro: dos webhooks del mismo
 * contacto a la vez leerían el mismo documento, y sin ella el más viejo podría
 * escribir el último.
 */
export const applyMarketingPreference = async (contact, preference) => {
    const changes = resolveMarketingPreference(contact, preference);
    if (!changes) return null;

    const updated = await Contact.findOneAndUpdate(
        {
            _id: contact._id,
            $or: [{ marketingPreferenceAt: null }, { marketingPreferenceAt: { $lte: preference.at } }],
        },
        { $set: changes },
        { new: true },
    );

    return updated && 'marketingOptOut' in changes ? updated : null;
};

/**
 * La persona cambió de número y WhatsApp le regeneró el BSUID (ver
 * `describeUserIdUpdate`). Es la misma persona: el contacto cambia los dos y
 * conserva su conversación. La regla de no editar el teléfono de un contacto
 * con conversación es para quien usa Wasmish; aquí es WhatsApp quien dice que
 * el número cambió.
 *
 * Se busca por el BSUID viejo: sin él guardado no hay a quién aplicarlo (y un
 * reintento del mismo aviso ya no lo encuentra). Devuelve el contacto si
 * cambió, o null.
 */
export const applyUserIdUpdate = async (userId, { previousWaUserId, waUserId, phone }) => {
    const contact = await Contact.findOne({ userId, waUserId: previousWaUserId });
    if (!contact) {
        console.warn('Cambio de número de alguien que no es contacto (o ya aplicado); se ignora.');
        return null;
    }

    contact.waUserId = waUserId;
    if (phone) contact.phone = phone;

    try {
        await contact.save();
    } catch (error) {
        // El BSUID o el número nuevos ya son de otro contacto: escribió desde el
        // número nuevo antes de que llegara este aviso. Como en
        // applyContactUpdates, fusionarlos no lo decide un webhook.
        if (error.code !== 11000) throw error;
        console.warn('Cambio de número hacia un identificador de otro contacto; no se aplica:', { contactId: String(contact._id) });
        return null;
    }

    // La copia del teléfono en la conversación, al momento: si no, buscar el
    // número VIEJO (`findConversationByNumber`) seguiría dando con ella.
    if (phone) {
        await Conversation.updateMany({ userId, contactId: contact._id }, { $set: { contactPhone: phone } });
    }

    return contact;
};

// ---------------------------------------------------------------------------
// API de la sección de Contactos
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;

// Un id mal formado es un contacto que no existe: 404, no un CastError (500).
const findOwnedContact = (userId, id) =>
    mongoose.isValidObjectId(id) ? Contact.findOne({ _id: id, userId }) : null;

const findContactConversation = (userId, contactId) =>
    Conversation.findOne({ userId, contactId }).lean();

const toIso = (date) => (date ? new Date(date).toISOString() : null);

// La forma en que la API devuelve un contacto, en la lista y en la ficha.
const serializeContact = (contact, conversation = null) => ({
    id: String(contact._id),
    displayName: contactDisplayName(contact),
    name: contact.name ?? null,
    profileName: contact.profileName ?? null,
    phone: contact.phone ?? null,
    username: contact.username ?? null,
    email: contact.email ?? null,
    company: contact.company ?? null,
    notes: contact.notes ?? null,
    source: contact.source ?? null,
    referral: contact.referral ?? null,
    // Solo los ids: los nombres los tiene el front con GET /tags.
    tagIds: (contact.tags ?? []).map(String),
    marketingOptOut: Boolean(contact.marketingOptOut),
    marketingOptOutAt: toIso(contact.marketingOptOutAt),
    conversationId: conversation ? String(conversation._id) : null,
    lastInteractionAt: toIso(conversation?.lastMessageAt),
    windowExpiresAt: toIso(getWindowExpiry(conversation?.lastInboundAt)),
    createdAt: toIso(contact.createdAt),
});

const sendContactError = (res, status, message, extra = {}) =>
    res.status(status).json([{ message, ...extra }]);

// El teléfono ya es de otro contacto. Se devuelve su id para que la UI ofrezca
// «Ver contacto» en vez de un error sin salida.
const sendDuplicatePhone = async (res, userId, phone) => {
    const existing = await Contact.findOne({ userId, phone }).select('_id').lean();
    return sendContactError(res, 409, 'Ya hay un contacto con ese número', {
        field: 'phone',
        contactId: existing ? String(existing._id) : null,
    });
};

const sendUnknownTags = (res) =>
    sendContactError(res, 400, 'Alguna etiqueta ya no existe: vuelve a elegirlas.', { field: 'tagIds' });

/**
 * Las etapas de aggregate que dejan los contactos de una búsqueda y un filtro,
 * cada uno con su `conversation` (o null). Las comparten la lista y las
 * campañas: «todos los que coinciden» tiene que ser exactamente lo que se ve.
 *
 * `userId` como ObjectId: aggregate no convierte tipos como find.
 */
export const contactSelectionStages = ({ userId, search, filter, tagIds }) => {
    const match = buildContactMatch({ userId, search, filter, tagIds });

    const conversationMatch = {
        with_conversation: [{ $match: { conversation: { $ne: null } } }],
        without_conversation: [{ $match: { conversation: null } }],
    }[filter] ?? [];

    return [
        { $match: match },
        { $lookup: { from: Conversation.collection.name, localField: '_id', foreignField: 'contactId', as: 'conversations' } },
        { $addFields: { conversation: { $ifNull: [{ $arrayElemAt: ['$conversations', 0] }, null] } } },
        { $project: { conversations: 0 } },
        ...conversationMatch,
    ];
};

/** Los ids válidos como ObjectId; los mal formados se ignoran. */
const toObjectIds = (ids = []) =>
    ids.filter(id => mongoose.isValidObjectId(id)).map(id => new mongoose.Types.ObjectId(id));

/**
 * Una selección «todos los que coinciden» (`mode: 'query'`): la búsqueda, el
 * filtro y las etiquetas de la lista de Contactos, menos los desmarcados. La
 * comparten las campañas y el etiquetado en bloque.
 */
export const selectionQueryStages = (userId, { search, filter, tagIds, excludeIds }) => [
    ...contactSelectionStages({
        userId: new mongoose.Types.ObjectId(userId),
        search,
        filter: CONTACT_FILTERS.includes(filter) ? filter : 'all',
        tagIds: toObjectIds(tagIds ?? []),
    }),
    { $match: { _id: { $nin: toObjectIds(excludeIds ?? []) } } },
];

/**
 * GET /contacts?search=&filter=&tags=&page=&limit=
 *
 * Ordena por actividad: la última conversación o, si no la hay, la fecha de
 * alta. Así un contacto recién creado aparece arriba y no al fondo con los
 * que nunca hablaron.
 */
export const listContacts = async (req, res) => {
    try {
        // aggregate no convierte tipos como find: el userId tiene que ir ya como ObjectId.
        const userId = new mongoose.Types.ObjectId(req.user.id);
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit) || PAGE_SIZE, 1), MAX_PAGE_SIZE);
        const filter = CONTACT_FILTERS.includes(req.query.filter) ? req.query.filter : 'all';
        // `?tags=id,id`: los que tienen alguna de esas etiquetas.
        const tagIds = toObjectIds(String(req.query.tags ?? '').split(',').filter(Boolean));

        const [result] = await Contact.aggregate([
            ...contactSelectionStages({ userId, search: req.query.search, filter, tagIds }),
            { $addFields: { activityAt: { $ifNull: ['$conversation.lastMessageAt', '$createdAt'] } } },
            { $sort: { activityAt: -1, _id: -1 } },
            { $facet: {
                items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
                total: [{ $count: 'count' }],
            } },
        ]);

        return res.json({
            contacts: result.items.map(item => serializeContact(item, item.conversation)),
            totalCount: result.total[0]?.count ?? 0,
            page,
            limit,
        });
    } catch (error) {
        return sendContactError(res, 500, error.message);
    }
};

// GET /contacts/:id — la ficha: el contacto y la actividad de su conversación.
export const getContact = async (req, res) => {
    try {
        const userId = req.user.id;
        const contact = await findOwnedContact(userId, req.params.id);
        if (!contact) return sendContactError(res, 404, 'Contacto no encontrado');

        const conversation = await findContactConversation(userId, contact._id);

        const [stats] = conversation
            ? await Message.aggregate([
                { $match: { conversationId: conversation._id } },
                { $group: {
                    _id: null,
                    firstMessageAt: { $min: '$timestamp' },
                    sent: { $sum: { $cond: [{ $eq: ['$direction', 'outbound'] }, 1, 0] } },
                    received: { $sum: { $cond: [{ $eq: ['$direction', 'inbound'] }, 1, 0] } },
                    failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
                } },
            ])
            : [];

        return res.json({
            ...serializeContact(contact, conversation),
            activity: {
                firstMessageAt: toIso(stats?.firstMessageAt),
                sent: stats?.sent ?? 0,
                received: stats?.received ?? 0,
                failed: stats?.failed ?? 0,
            },
        });
    } catch (error) {
        return sendContactError(res, 500, error.message);
    }
};

// POST /contacts — alta manual. Crear un contacto no envía nada.
export const createContact = async (req, res) => {
    const userId = req.user.id;
    const fields = pickContactFields(req.body);
    try {
        const tags = await resolveOwnedTagIds(userId, req.body.tagIds ?? []);
        if (!tags) return sendUnknownTags(res);

        const contact = await Contact.create({ userId, ...fields, tags, source: 'manual' });
        return res.status(201).json(serializeContact(contact));
    } catch (error) {
        if (error.code === 11000) return sendDuplicatePhone(res, userId, fields.phone);
        return sendContactError(res, 500, error.message);
    }
};

/**
 * PATCH /contacts/:id — solo los campos editables (ver `pickContactFields`).
 * El teléfono no cambia si hay conversación: para WhatsApp el número es la
 * persona, y el historial y la ventana de 24 h son de ese número.
 */
export const updateContact = async (req, res) => {
    const userId = req.user.id;
    const fields = pickContactFields(req.body);
    try {
        const contact = await findOwnedContact(userId, req.params.id);
        if (!contact) return sendContactError(res, 404, 'Contacto no encontrado');

        const conversation = await findContactConversation(userId, contact._id);
        if (conversation && fields.phone !== undefined && fields.phone !== contact.phone) {
            return sendContactError(res, 409, 'El número no se puede cambiar: el historial de WhatsApp es de este número.', { field: 'phone' });
        }

        if (req.body.tagIds !== undefined) {
            const tags = await resolveOwnedTagIds(userId, req.body.tagIds ?? []);
            if (!tags) return sendUnknownTags(res);
            contact.tags = tags;
        }

        Object.assign(contact, fields);
        await contact.save();
        return res.json(serializeContact(contact, conversation));
    } catch (error) {
        if (error.code === 11000) return sendDuplicatePhone(res, userId, fields.phone);
        return sendContactError(res, 500, error.message);
    }
};

// DELETE /contacts/:id — solo si nunca hubo conversación: con ella, borrar el
// contacto no serviría de nada (el siguiente mensaje lo volvería a crear) y
// dejaría el historial sin dueño.
export const deleteContact = async (req, res) => {
    try {
        const userId = req.user.id;
        const contact = await findOwnedContact(userId, req.params.id);
        if (!contact) return sendContactError(res, 404, 'Contacto no encontrado');

        if (await Conversation.exists({ userId, contactId: contact._id })) {
            return sendContactError(res, 409, 'Tiene conversación: su historial se conserva. Puedes editar sus datos.');
        }

        await Contact.deleteOne({ _id: contact._id, userId });
        return res.sendStatus(204);
    } catch (error) {
        return sendContactError(res, 500, error.message);
    }
};

/** Las etapas que dejan solo los contactos de una selección (ver `contactSelectionSchema`). */
const selectionStages = (userId, selection) => (
    selection.mode === 'ids'
        ? [{ $match: { userId: new mongoose.Types.ObjectId(userId), _id: { $in: toObjectIds(selection.contactIds) } } }]
        : selectionQueryStages(userId, selection)
);

/** Los ids de los contactos de una selección. */
const selectedContactIds = async (userId, selection) => {
    const rows = await Contact.aggregate([...selectionStages(userId, selection), { $project: { _id: 1 } }]);
    return rows.map(row => row._id);
};

/**
 * POST /contacts/tags/summary — cuántos de una selección tienen cada etiqueta,
 * antes de etiquetar: «17 ya la tienen» al añadir, «2 de 3» al quitar. Con
 * «todos los que coinciden» el front no tiene esos contactos cargados. Las
 * etiquetas que no tiene nadie de la selección no salen.
 */
export const summarizeSelectionTags = async (req, res) => {
    try {
        const [result] = await Contact.aggregate([
            ...selectionStages(req.user.id, req.body.selection),
            {
                $facet: {
                    total: [{ $count: 'count' }],
                    tags: [{ $unwind: '$tags' }, { $group: { _id: '$tags', count: { $sum: 1 } } }],
                },
            },
        ]);
        return res.json({
            total: result.total[0]?.count ?? 0,
            tags: result.tags.map(tag => ({ id: String(tag._id), count: tag.count })),
        });
    } catch (error) {
        return sendContactError(res, 500, error.message);
    }
};

/**
 * POST /contacts/tags — añadir y quitar etiquetas a muchos a la vez: los
 * marcados o «todos los que coinciden». Un solo update por contacto, con las
 * etiquetas que tenía menos las quitadas más las añadidas. A quien se pasaría
 * de MAX_TAGS_PER_CONTACT no se le toca y se cuenta en `overLimit`.
 */
export const bulkTagContacts = async (req, res) => {
    const userId = req.user.id;
    try {
        const add = await resolveOwnedTagIds(userId, req.body.add ?? []);
        if (!add) return sendUnknownTags(res);
        // Quitar una que no es de la cuenta no hace nada: no hace falta comprobarla.
        const remove = toObjectIds(req.body.remove ?? []);

        const contactIds = await selectedContactIds(userId, req.body.selection);
        if (contactIds.length === 0) return res.json({ matched: 0, modified: 0, overLimit: 0 });

        const nextTags = { $setUnion: [{ $setDifference: [{ $ifNull: ['$tags', []] }, remove] }, add] };
        const { matchedCount, modifiedCount } = await Contact.updateMany(
            { _id: { $in: contactIds }, userId, $expr: { $lte: [{ $size: nextTags }, MAX_TAGS_PER_CONTACT] } },
            [{ $set: { tags: nextTags } }],
        );
        return res.json({ matched: contactIds.length, modified: modifiedCount, overLimit: contactIds.length - matchedCount });
    } catch (error) {
        return sendContactError(res, 500, error.message);
    }
};
