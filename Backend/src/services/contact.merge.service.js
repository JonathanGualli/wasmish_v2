// Absorbe el contacto que crearon los ecos en el contacto verdadero de la misma
// persona (coexistencia, 2026-10-19). Cuándo un contacto es «de eco», y por qué
// pasa: utils/contact.merge.js.

import Contact from '../models/contact.model.js';
import Conversation from '../models/conversation.model.js';
import Message from '../models/message.model.js';
import ContactNote from '../models/contact.note.model.js';
import CampaignRecipient from '../models/campaign.recipient.model.js';
import { isUntouchedEchoContact } from '../utils/contact.merge.js';
import { sendToAccount } from '../controllers/stream.controller.js';

// Lo que hay del contacto fuera de su documento (`usage` de isUntouchedEchoContact).
const describeUsage = async (contact) => {
    const conversationIds = await Conversation.find({ userId: contact.userId, contactId: contact._id }).distinct('_id');
    const [echoMessages, otherMessages, notes, campaignRecipients] = await Promise.all([
        Message.countDocuments({ conversationId: { $in: conversationIds }, origin: 'businessApp' }),
        Message.countDocuments({ conversationId: { $in: conversationIds }, origin: { $ne: 'businessApp' } }),
        ContactNote.countDocuments({ userId: contact.userId, contactId: contact._id }),
        CampaignRecipient.countDocuments({ userId: contact.userId, contactId: contact._id }),
    ]);
    return { echoMessages, otherMessages, notes, campaignRecipients };
};

// La conversación del contacto verdadero en la misma línea que `conversation`
// (o en el mismo número, si es de la reserva sin línea).
const keeperConversationFor = (keeper, conversation) => Conversation.findOne({
    userId: keeper.userId,
    contactId: keeper._id,
    ...(conversation.lineId
        ? { lineId: conversation.lineId }
        : { lineId: null, phoneNumberId: conversation.phoneNumberId }),
});

/**
 * Si el contacto de la cuenta que tiene `phone` es un contacto de eco, lo
 * absorbe en `keeper` y devuelve true; si no, no toca nada y devuelve false.
 *
 * Por cada conversación del contacto de eco: si `keeper` ya tiene una en esa
 * línea, los ecos pasan a ella (con su vista previa y la pausa del bot, que
 * nunca retroceden), la otra se borra y se avisa con `conversation_merged`, para
 * que el chat abierto de la verdadera vuelva a pedir sus mensajes; si no, la
 * conversación pasa a `keeper`. El contacto de eco se borra al final. Todo es
 * repetible: dos entrantes a la vez pueden llegar aquí los dos, y el segundo no
 * encuentra nada que mover.
 *
 * Un eco que se guarda en la conversación absorbida mientras tanto no se pierde
 * (revisiones de Codex del PR #102): si llega antes del borrado, lo recoge el
 * segundo barrido de después; si llega después, `procesarEco` ve que su
 * conversación o su contacto ya no existen y se muda solo. Y una conversación
 * que un eco cree para el contacto de eco mientras tanto la recoge la segunda
 * pasada, que vuelve a buscarlas después de borrar el contacto.
 */
export const mergeEchoContactInto = async (keeper, phone) => {
    const echoContact = await Contact.findOne({ userId: keeper.userId, phone, _id: { $ne: keeper._id } });
    if (!echoContact) return false;
    if (!isUntouchedEchoContact(echoContact, await describeUsage(echoContact))) return false;

    const absorb = async (conversation) => {
        const target = await keeperConversationFor(keeper, conversation);
        if (!target) {
            await Conversation.updateOne({ _id: conversation._id }, { $set: { contactId: keeper._id } });
            return;
        }

        const moveMessages = () => Message.updateMany({ conversationId: conversation._id }, { $set: { conversationId: target._id } });
        await moveMessages();
        if (conversation.lastMessageAt) {
            await Conversation.updateOne(
                { _id: target._id, $or: [{ lastMessageAt: null }, { lastMessageAt: { $lt: conversation.lastMessageAt } }] },
                { $set: { lastMessage: conversation.lastMessage, lastMessageAt: conversation.lastMessageAt } },
            );
        }
        // Alguien respondió desde la app: el bot se calla también en la verdadera.
        const humanRepliedAt = conversation.bot?.humanRepliedAt;
        if (humanRepliedAt) {
            await Conversation.updateOne(
                { _id: target._id, $or: [{ 'bot.humanRepliedAt': null }, { 'bot.humanRepliedAt': { $lt: humanRepliedAt } }] },
                { $set: { 'bot.humanRepliedAt': humanRepliedAt } },
            );
        }
        await Conversation.deleteOne({ _id: conversation._id, userId: keeper.userId });
        await moveMessages();
        sendToAccount(String(keeper.userId), 'conversation_merged',
            { id: String(target._id), mergedId: String(conversation._id) },
            { lineId: target.lineId ?? null });
    };
    const conversationsOf = () => Conversation.find({ userId: keeper.userId, contactId: echoContact._id });

    const conversations = await conversationsOf();
    for (const conversation of conversations) await absorb(conversation);
    await Contact.deleteOne({ _id: echoContact._id, userId: keeper.userId });
    // Segunda pasada: las que se crearon para el contacto de eco mientras tanto.
    // Las que nazcan después ya no lo encuentran (`procesarEco` se muda solo).
    for (const conversation of await conversationsOf()) await absorb(conversation);

    console.log('Contacto de eco fusionado con el de su BSUID:', {
        contactId: String(keeper._id), absorbedId: String(echoContact._id), conversaciones: conversations.length,
    });
    return true;
};
