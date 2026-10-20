import type { Message, MessageQuote, QuotedMessage } from "../models/message.mode";

/**
 * La cita de un mensaje que ya está en pantalla: la barra «Respondiendo a» y el
 * mensaje optimista, antes de que el servidor devuelva la suya. La misma forma
 * que da el backend (`serializeQuoted`).
 */
export const quoteFromMessage = (msg: Message): QuotedMessage => ({
    id: msg.id,
    sender: msg.sender,
    type: msg.type ?? "text",
    text: msg.text.slice(0, 200),
    hasMedia: Boolean(msg.hasMedia),
    deleted: Boolean(msg.deletedAt),
    sentBy: msg.sentBy ?? null,
    origin: msg.origin?.kind ?? null,
});

/** Se puede ir al original (y Wasmish lo tiene). */
export const isAvailableQuote = (quote: MessageQuote | null | undefined): quote is QuotedMessage => Boolean(quote?.id);

/**
 * Quién escribió lo citado, por su nombre: el hilo lo leen varias personas y
 * «Tú» cambia según quién mira (decisión del diseño de Claude Design). Solo una
 * cuenta de una persona dice «Tú», porque ahí no hay duda; con equipo, lo que
 * no tiene autor (anterior a firmar los mensajes) es «Equipo».
 */
export const quoteAuthor = (quote: QuotedMessage, { contactName, team }: { contactName: string; team: boolean }) => {
    if (quote.sender === "them") return contactName;
    if (quote.sentBy?.name) return quote.sentBy.name;
    switch (quote.origin) {
        case "bot": return "Bot";
        case "businessApp": return "Desde el celular";
        case "campaign": return "Campaña";
        case "api": return "API";
        default: return team ? "Equipo" : "Tú";
    }
};
