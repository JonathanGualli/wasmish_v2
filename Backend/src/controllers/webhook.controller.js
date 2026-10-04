import { WHATSAPP_VERIFY_TOKEN } from '../config.js';
import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import { sendUser } from './stream.controller.js';
import Conversation from "../models/conversation.model.js";
import {
    resolveContact, findOrCreateConversation, findContactByIdentity, getConversationContact, applyMarketingPreference,
} from './contact.controller.js';
import { resolveStatusTransition } from '../utils/message.status.js';
import { getWindowExpiry } from '../utils/whatsapp.window.js';
import { describeInboundMessage } from '../utils/inbound.message.js';
import { describeInboundContact, hasContactIdentity } from '../utils/contact.identity.js';
import { describeUserPreference, isMarketingOptOutFailure } from '../utils/marketing.preference.js';
import { TIPOS_CON_ARCHIVO, nombreDeArchivo, guardarArchivo } from '../utils/media.storage.js';
import { getMediaInfo, downloadMedia } from '../libs/whatsapp.js';
import { decrypt } from '../utils/crypto.js';
import { MEDIA_DIR, MEDIA_MAX_BYTES } from '../config.js';

// Baja el adjunto y lo deja en disco. Devuelve SIEMPRE un objeto: si algo falla
// —token caducado, archivo enorme, Meta caída— sale con mediaFile en null y el
// mensaje se guarda igual con su etiqueta. Perder la foto es un problema;
// perder el mensaje entero sería mucho peor.
const descargarAdjunto = async (user, entrante) => {
    const vacio = { mediaFile: null, mediaFilename: null, mediaSize: null, mimeType: entrante.mimeType };

    if (!entrante.mediaId || !TIPOS_CON_ARCHIVO.has(entrante.type)) return vacio;

    try {
        const token = decrypt(user.tokenWhatsapp);
        if (!token) return vacio;

        const info = await getMediaInfo({ token, mediaId: entrante.mediaId });

        // El tamaño se comprueba ANTES de bajar: si no, el tope solo actuaría
        // después de habernos tragado los bytes.
        const tamano = Number(info?.file_size ?? 0);
        if (tamano > MEDIA_MAX_BYTES) {
            console.warn('Adjunto omitido por tamaño:', { mediaId: entrante.mediaId, tamano, tope: MEDIA_MAX_BYTES });
            return vacio;
        }

        // El mime de la descarga manda sobre el del webhook: es el que Meta usa
        // de verdad para el archivo.
        const mimeType = info?.mime_type ?? entrante.mimeType;
        const nombre = nombreDeArchivo(entrante.mediaId, mimeType);
        if (!nombre) return vacio;

        const contenido = await downloadMedia({ token, url: info.url, maxBytes: MEDIA_MAX_BYTES });
        await guardarArchivo(MEDIA_DIR, nombre, contenido);

        return { mediaFile: nombre, mediaFilename: entrante.filename ?? null, mediaSize: contenido.length, mimeType };
    } catch (error) {
        console.error('No se pudo descargar el adjunto:', {
            mediaId: entrante.mediaId, type: entrante.type,
            error: error.waErrorDetail ?? error.message,
        });
        return vacio;
    }
};

export const verifyWebhook = (req, res) => { 
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) { 
        return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
}

// Procesa UN mensaje entrante: lo guarda, actualiza la conversación y avisa por
// SSE. Vive fuera de handleWebhook para poder envolver cada mensaje en su
// propio try/catch — ver el comentario del bucle.
//
// `contacts` es el `value.contacts` del mismo lote: el perfil del remitente.
const procesarEntrante = async (user, phoneNumberId, messageData, contacts) => {
    // Traduce la forma que manda Meta (image.caption, button.text…)
    // a { type, text, mediaId, mimeType }. Devuelve null en los que
    // no son mensajes de la conversación, como los 'system'.
    const entrante = describeInboundMessage(messageData);
    if(!entrante) return;

    // Idempotencia. Meta reintenta el lote entero cuando no recibe el 200 a
    // tiempo, y este handler baja los adjuntos antes de responder: un archivo
    // grande o una Graph API lenta bastan para provocarlo. Sin esta comprobación
    // el reintento creaba un segundo Message y el cliente veía el mensaje dos
    // veces. Va ANTES de descargar nada, que es lo caro de todo el camino.
    if (messageData.id && await Message.exists({ waMessageId: messageData.id })) return;

    // Quién escribe. Puede llegar SIN teléfono: si la persona usa nombre de
    // usuario y no ha hablado con el negocio en 30 días, Meta solo manda su
    // BSUID. Antes eso hacía fallar la conversación (contactPhone era required)
    // y el mensaje se perdía.
    const identity = describeInboundContact(contacts, messageData);
    if (!hasContactIdentity(identity)) {
        console.warn('Entrante sin teléfono ni BSUID; se descarta:', { waMessageId: messageData.id, type: messageData.type });
        return;
    }

    const timestamp = messageData.timestamp ? new Date(parseInt(messageData.timestamp) * 1000) : new Date();

    const contact = await resolveContact(user._id, identity, {
        source: identity.referral ? 'ad' : 'inbound',
        referral: identity.referral,
    });
    const conversation = await findOrCreateConversation({ userId: user._id, contact, phoneNumberId });

    // La ventana nunca retrocede: Meta no garantiza el orden de los
    // webhooks, y un entrante viejo que llegue tarde la cerraría antes
    // de tiempo. Mismo criterio que resolveStatusTransition.
    if(!conversation.lastInboundAt || timestamp > conversation.lastInboundAt) {
        conversation.lastInboundAt = timestamp;
    }

    // El archivo se baja ANTES de crear el mensaje para que, cuando este llegue
    // por SSE, la foto ya se pueda pintar. Añade unos cientos de ms al webhook; a
    // cambio no hace falta ni cola ni un segundo evento avisando de que ya está.
    const adjunto = await descargarAdjunto(user, entrante);

    // Create message inbound
    let messageCreated;
    try {
        messageCreated = await Message.create({
            conversationId: conversation._id,
            direction: 'inbound',
            sender: 'them',
            waMessageId: messageData.id,
            type: entrante.type,
            text: entrante.text,
            mediaId: entrante.mediaId,
            mimeType: adjunto.mimeType,
            mediaFile: adjunto.mediaFile,
            mediaFilename: adjunto.mediaFilename,
            mediaSize: adjunto.mediaSize,
            caption: entrante.caption,
            timestamp,
            status: 'delivered',
            deliveredAt: timestamp,
        });
    } catch (error) {
        // 11000 = clave duplicada. El `exists` de arriba no basta por sí solo:
        // dos entregas del mismo webhook a la vez pueden pasarlo las dos antes
        // de que ninguna haya escrito. El índice único es quien decide, y que
        // pare a la segunda es exactamente lo que queremos — el mensaje ya está
        // guardado, así que salimos sin tocar la conversación ni emitir por SSE.
        if (error.code === 11000) return;
        throw error;
    }

    // Update conversation
    conversation.lastMessage = entrante.text;
    conversation.lastMessageAt = timestamp;
    conversation.unreadCount = (conversation.unreadCount || 0) + 1;
    await conversation.save();

    sendUser(
        String(user._id),
        'message_created', {
            id: String(messageCreated._id),
            conversationId: String(conversation._id),
            sender: 'them',
            type: entrante.type,
            text: entrante.text, 
            hasMedia: Boolean(adjunto.mediaFile),
            caption: entrante.caption,
            mediaFilename: adjunto.mediaFilename,
            mediaSize: adjunto.mediaSize,
            timestamp: timestamp.toISOString(),
            status: 'delivered',
            unreadCount: conversation.unreadCount,
            windowExpiresAt: getWindowExpiry(conversation.lastInboundAt)?.toISOString() ?? null,
        }
    );

    // Log the created message.
    //
    // SIN el texto a propósito. Esto son conversaciones privadas de los clientes
    // de nuestros clientes, y `docker compose logs` no caduca, no rota y lo lee
    // cualquiera con acceso al servidor. Para diagnosticar basta con saber que el
    // mensaje llegó, de qué tipo era y en qué conversación cayó: el contenido se
    // mira en la app, que es donde tiene sentido. `longitud` distingue el caso que
    // de verdad importa —un texto vacío o gigante— sin enseñar nada.
    console.log("Inbound message processed:", {
        id: String(messageCreated._id),
        conversationId: String(messageCreated.conversationId),
        sender: messageCreated.sender,
        type: messageCreated.type,
        longitud: messageCreated.text.length,
        unreadCount: conversation.unreadCount,
        timestamp: messageCreated.timestamp.toISOString(),
        status: messageCreated.status,
        waMessageId: messageCreated.waMessageId,
    });
};

// Avisa a la UI de que un contacto se dio de baja o de alta de la publicidad.
// La ficha y la lista de Contactos se refrescan con él.
const avisarPreferencia = (user, contact) => {
    sendUser(String(user._id), 'contact_updated', {
        id: String(contact._id),
        marketingOptOut: contact.marketingOptOut,
        marketingOptOutAt: contact.marketingOptOutAt ? contact.marketingOptOutAt.toISOString() : null,
    });
    // Sin teléfono ni nombre: basta el id para encontrarlo en la app.
    console.log('Preferencia de marketing:', {
        contactId: String(contact._id),
        marketingOptOut: contact.marketingOptOut,
    });
};

// Procesa UN aviso de `user_preferences`: la persona pidió dejar de recibir
// publicidad, o volver a recibirla.
const procesarPreferencia = async (user, preferenceData) => {
    const preference = describeUserPreference(preferenceData);
    if (!preference) return;

    if (!hasContactIdentity(preference)) {
        console.warn('Preferencia sin teléfono ni BSUID; se descarta:', { category: preferenceData?.category });
        return;
    }

    // No se crea el contacto: para darse de baja tuvo que recibir una plantilla
    // nuestra, y cada envío ya deja su contacto. Si no está, es de otra
    // herramienta que comparte el número, y no hay nada que marcar.
    const contact = await findContactByIdentity(user._id, preference);
    if (!contact) {
        console.warn('Preferencia de marketing de un contacto que no existe; se ignora.');
        return;
    }

    const updated = await applyMarketingPreference(contact, preference);
    if (updated) avisarPreferencia(user, updated);
};

// El 131050 dice que la persona está dada de baja aunque el webhook de
// `user_preferences` no haya llegado (no estar suscrito a ese campo, o que se
// perdiera). Se marca con la hora del acuse.
const marcarBajaPorFallo = async (user, message, timestamp) => {
    const conversation = await Conversation.findOne({ _id: message.conversationId, userId: user._id });
    if (!conversation) return;

    const contact = await getConversationContact(conversation);
    const updated = await applyMarketingPreference(contact, { optOut: true, at: timestamp });
    if (updated) avisarPreferencia(user, updated);
};

// Procesa UN acuse de recibo (entregado / leído / fallido).
const procesarEstado = async (user, statusData) => {

    const waMessageId = statusData.id;
    const status = statusData.status; // 'send' | 'delivered' | 'read' | 'failed'
    const timestamp = statusData.timestamp ? new Date(parseInt(statusData.timestamp) * 1000) : new Date();

    if(!waMessageId) return;

    const message = await Message.findOne({ waMessageId });
    if(!message) return;

    // Estado desconocido, repetido o que retrocede → lo ignoramos
    const changes = resolveStatusTransition({
        currentStatus: message.status,
        incomingStatus: status,
        timestamp,
        hasDeliveredAt: Boolean(message.deliveredAt),
    });

    if (!changes) return;

    Object.assign(message, changes);

    if (status === 'failed') {
        const errors = statusData?.errors ?? [];
        if (!message.errorCode && errors.length > 0) {
            message.errorCode = errors[0]?.code;
            message.errorDetail = errors[0]?.error_data?.details;
        }
    }

    await message.save();

    sendUser(
        String(user._id),
        'message_status', {
            id: String(message._id),
            conversationId: String(message.conversationId),
            waMessageId, 
            status: message.status,
            deliveredAt: message.deliveredAt ? message.deliveredAt.toISOString() : null,
            readAt: message.readAt ? message.readAt.toISOString() : null,
            failedAt: message.failedAt ? message.failedAt.toISOString() : null,
            errorCode: message.errorCode,
            errorDetail: message.errorDetail,
            // Si salió de un envío masivo: su detalle se refresca con esto,
            // porque las entregas y lecturas llegan horas después de enviar.
            ...(message.campaignId && { campaignId: String(message.campaignId) }),
        }
    );

    // Solo se registran los fallos. Cada mensaje enviado genera dos o tres acuses
    // (`delivered`, `read`), y anotarlos todos multiplicaba por tres el tamaño del
    // log sin decir nada: que un mensaje llegue es lo normal, y el estado ya queda
    // guardado en el propio Message y se ve en la UI. Lo que se busca en un log es
    // lo que salió mal, y eso sí se conserva entero, con el error de Meta.
    if (message.status === 'failed') {
        console.error("Message failed:", {
            id: String(message._id),
            waMessageId: message.waMessageId,
            errors: statusData.errors,
        });

        if (isMarketingOptOutFailure(statusData.errors)) {
            await marcarBajaPorFallo(user, message, timestamp);
        }
    }
};

export const handleWebhook = async (req, res) => {
    try {
        const body = req.body;

        if(!body.entry) return res.sendStatus(200);

        for(const entry of body.entry) {
            for(const change of entry.changes ?? []){
                const value = change.value;
                const phoneNumberId = value?.metadata?.phone_number_id;

                if(!phoneNumberId) continue;

                const user = await User.findOne({ phoneNumberId });
                if (!user) continue;

                const messages = value?.messages ?? [];

                for(const messageData of messages) {
                    // Cada mensaje va en su propio try/catch a propósito. Si dejáramos
                    // subir el error, handleWebhook respondería 500 y Meta reintentaría
                    // el LOTE ENTERO: como no hay índice único en waMessageId, los que
                    // sí se guardaron se duplicarían en el chat del cliente. Ahora Meta
                    // recibe 200 y como mucho se pierde el mensaje que venía roto.
                    try {
                        await procesarEntrante(user, phoneNumberId, messageData, value.contacts);
                    } catch (error) {
                        console.error("Entrante descartado por error:", {
                            waMessageId: messageData?.id,
                            type: messageData?.type,
                            error: error.message,
                        });
                    }
                }

                // Delivery/read status updates
                const statuses = value?.statuses ?? [];
                for(const statusData of statuses) {
                    try {
                        await procesarEstado(user, statusData);
                    } catch (error) {
                        console.error("Acuse descartado por error:", {
                            waMessageId: statusData?.id,
                            status: statusData?.status,
                            error: error.message,
                        });
                    }
                }

                // Bajas y altas de publicidad. Llegan en su propio campo del
                // webhook (`user_preferences`), que hay que tener marcado en el
                // panel de la app de Meta para que Meta lo mande.
                const preferences = value?.user_preferences ?? [];
                for(const preferenceData of preferences) {
                    try {
                        await procesarPreferencia(user, preferenceData);
                    } catch (error) {
                        console.error("Preferencia descartada por error:", {
                            category: preferenceData?.category,
                            value: preferenceData?.value,
                            error: error.message,
                        });
                    }
                }
            }
        }

        res.sendStatus(200);
    } catch (error) {
        console.error("Error handling webhook:", error);
        res.sendStatus(500);
    }
};