import { WHATSAPP_VERIFY_TOKEN } from '../config.js';
import Message from "../models/message.model.js";
import { sendToAccount } from './stream.controller.js';
import Conversation from "../models/conversation.model.js";
import {
    resolveContact, findOrCreateConversation, findContactByIdentity, getConversationContact, applyMarketingPreference,
    applyUserIdUpdate,
} from './contact.controller.js';
import { resolveStatusTransition } from '../utils/message.status.js';
import { getWindowExpiry } from '../utils/whatsapp.window.js';
import { describeInboundMessage } from '../utils/inbound.message.js';
import { describeInboundContact, hasContactIdentity, describeUserIdUpdate } from '../utils/contact.identity.js';
import { describeUserPreference, isMarketingOptOutFailure } from '../utils/marketing.preference.js';
import { TIPOS_CON_ARCHIVO, nombreDeArchivo, guardarArchivo } from '../utils/media.storage.js';
import { getMediaInfo, downloadMedia } from '../libs/whatsapp.js';
import { decrypt } from '../utils/crypto.js';
import { MEDIA_DIR, MEDIA_MAX_BYTES } from '../config.js';
import { disconnectRemovedWaba, findInboundLine, rememberDisplayPhoneNumber } from '../services/line.service.js';
import { notifyInbound } from '../services/push.service.js';
import { buildAutoReplyJob } from '../services/auto.reply.service.js';
import { wakeAutoReplyWorker } from '../workers/auto.reply.worker.js';
import { markHumanReply } from '../services/auto.reply.service.js';
import { describeEcho, parsePartnerRemoved } from '../utils/business.app.js';
import { isMessageChange } from '../utils/message.change.js';
import { serializeMessage } from './chat.controller.js';

// Baja el adjunto y lo deja en disco. Devuelve SIEMPRE un objeto: si algo falla
// —token caducado, archivo enorme, Meta caída— sale con mediaFile en null y el
// mensaje se guarda igual con su etiqueta. Perder la foto es un problema;
// perder el mensaje entero sería mucho peor.
const descargarAdjunto = async (inbound, entrante) => {
    const vacio = { mediaFile: null, mediaFilename: null, mediaSize: null, mimeType: entrante.mimeType };

    if (!entrante.mediaId || !TIPOS_CON_ARCHIVO.has(entrante.type)) return vacio;
    // El token es el del WABA de la línea; sin él no hay con qué pedir el archivo.
    if (!inbound.tokenWhatsapp) return vacio;

    try {
        const token = decrypt(inbound.tokenWhatsapp);
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
// `inbound` es la línea que lo recibe (`findInboundLine`): su cuenta, su línea
// y el token de su WABA. `contacts` es el `value.contacts` del mismo lote: el
// perfil del remitente.
const procesarEntrante = async (inbound, messageData, contacts) => {
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

    const contact = await resolveContact(inbound.accountId, identity, {
        source: identity.referral ? 'ad' : 'inbound',
        referral: identity.referral,
    });
    // La conversación del contacto EN ESTA LÍNEA: la de otro número tiene su
    // propio historial y su propia ventana.
    const conversation = await findOrCreateConversation({ userId: inbound.accountId, contact, line: inbound });

    // La ventana nunca retrocede: Meta no garantiza el orden de los
    // webhooks, y un entrante viejo que llegue tarde la cerraría antes
    // de tiempo. Mismo criterio que resolveStatusTransition.
    if(!conversation.lastInboundAt || timestamp > conversation.lastInboundAt) {
        conversation.lastInboundAt = timestamp;
    }

    // El archivo se baja ANTES de crear el mensaje para que, cuando este llegue
    // por SSE, la foto ya se pueda pintar. Añade unos cientos de ms al webhook; a
    // cambio no hace falta ni cola ni un segundo evento avisando de que ya está.
    const adjunto = await descargarAdjunto(inbound, entrante);

    // El trabajo de las respuestas automáticas nace con el mensaje: si el
    // mensaje existe, existe su trabajo. Antes de guardar la conversación, que
    // es de donde sale cuándo había escrito antes el contacto. Nunca lanza.
    const botJob = await buildAutoReplyJob({ accountId: inbound.accountId, contactId: contact._id, type: entrante.type });

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
            ...(botJob && { bot: botJob }),
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

    sendToAccount(
        String(inbound.accountId),
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
        },
        // Solo a quien ve esa línea (Fase 3).
        { lineId: conversation.lineId ?? null },
    );

    // Ya se ve en el chat: el bot puede responder. Si esto falla, el barrido
    // del worker lo recoge a los 30 s; el webhook sigue.
    if (botJob) {
        try {
            await Message.updateOne({ _id: messageCreated._id, 'bot.status': 'waiting' }, { $set: { 'bot.status': 'pending' } });
            wakeAutoReplyWorker();
        } catch (error) {
            console.error('No se pudo marcar el entrante para el bot:', { messageId: String(messageCreated._id), error: error.message });
        }
    }

    // El aviso push a los dispositivos de quien ve esa línea (app móvil). Sin
    // esperar: un servicio de push lento o caído no puede frenar ni tumbar el webhook.
    void notifyInbound({
        accountId: inbound.accountId,
        lineId: conversation.lineId ?? null,
        conversationId: conversation._id,
        contact,
        text: entrante.text,
        type: entrante.type,
        caption: entrante.caption,
    });

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

// Procesa UN eco: lo que el negocio respondió desde la app de WhatsApp Business
// (coexistencia, `smb_message_echoes`). Es un saliente más de la conversación,
// marcado `origin: 'businessApp'`. El orden importa (spec de la coexistencia, § 4):
// guardar el mensaje es la reclamación (el índice único de `waMessageId`); solo
// quien la gana pausa al bot, baja el archivo, toca la conversación y avisa por
// SSE. Sin aviso push: lo escribió el propio negocio.
const procesarEco = async (inbound, echoData) => {
    const eco = describeEcho(echoData, { connectedAt: inbound.connectedAt });
    if (!eco) {
        // Sin destinatario no hay conversación: que quede en el log (sin datos
        // de la persona), no como antes, que se perdía en silencio.
        if (echoData?.id && !isMessageChange(echoData) && !echoData.to && !echoData.to_user_id) {
            console.warn('Eco sin destinatario (ni to ni to_user_id); se descarta:', { waMessageId: echoData.id, type: echoData.type });
        }
        return;
    }
    const { waMessageId, toPhone, toUserId, timestamp, entrante } = eco;

    // El `exists` ahorra el trabajo de un reintento; la garantía es el índice único.
    if (await Message.exists({ waMessageId })) return;

    // Como un entrante: por el BSUID primero, que identifica a la persona aunque
    // Meta no mande el teléfono (antes se buscaba solo por teléfono, y el eco a
    // quien tenía nombre de usuario creaba otro contacto o se perdía).
    const contact = await resolveContact(inbound.accountId, { phone: toPhone, waUserId: toUserId }, { source: 'inbound' });
    const conversation = await findOrCreateConversation({ userId: inbound.accountId, contact, line: inbound });

    let message;
    try {
        message = await Message.create({
            conversationId: conversation._id,
            direction: 'outbound',
            sender: 'me',
            origin: 'businessApp',
            waMessageId,
            type: entrante.type,
            text: entrante.text,
            mediaId: entrante.mediaId,
            mimeType: entrante.mimeType,
            caption: entrante.caption,
            timestamp,
            status: 'sent',
        });
    } catch (error) {
        // Otra entrega del mismo eco ya lo guardó: ella hace el resto.
        if (error.code === 11000) return;
        throw error;
    }

    // Una persona respondió: el bot se calla, y cuanto antes (antes de bajar nada).
    await markHumanReply(conversation._id);

    const adjunto = await descargarAdjunto(inbound, entrante);
    if (adjunto.mediaFile) {
        Object.assign(message, {
            mediaFile: adjunto.mediaFile, mediaFilename: adjunto.mediaFilename,
            mediaSize: adjunto.mediaSize, mimeType: adjunto.mimeType,
        });
        await Message.updateOne({ _id: message._id }, { $set: {
            mediaFile: adjunto.mediaFile, mediaFilename: adjunto.mediaFilename,
            mediaSize: adjunto.mediaSize, mimeType: adjunto.mimeType,
        } });
    }

    // La conversación nunca retrocede: Meta no garantiza el orden. La vista
    // previa avanza si el eco es más nuevo o si la conversación acaba de nacer
    // (sin vista previa, con `lastMessageAt` = ahora). Los no leídos se ponen en
    // cero solo si no llegó un entrante después del eco.
    await Conversation.updateOne(
        { _id: conversation._id, $or: [{ lastMessage: { $in: ['', null] } }, { lastMessageAt: { $lt: timestamp } }] },
        { $set: { lastMessage: entrante.text, lastMessageAt: timestamp } },
    );
    await Conversation.updateOne(
        { _id: conversation._id, $or: [{ lastInboundAt: null }, { lastInboundAt: { $lte: timestamp } }] },
        { $set: { unreadCount: 0 } },
    );
    const { unreadCount = 0 } = await Conversation.findById(conversation._id).select('unreadCount').lean() ?? {};

    const meta = { lineId: conversation.lineId ?? null };
    sendToAccount(String(inbound.accountId), 'message_created', serializeMessage(message), meta);
    sendToAccount(String(inbound.accountId), 'conversation_updated', { id: String(conversation._id), unreadCount }, meta);

    // Sin el texto, como los entrantes.
    console.log('Eco de la app de WhatsApp Business guardado:', {
        id: String(message._id), conversationId: String(conversation._id), type: message.type,
        longitud: message.text.length, waMessageId,
    });
};

// Avisa a la UI de que un contacto se dio de baja o de alta de la publicidad.
// La ficha y la lista de Contactos se refrescan con él.
const avisarPreferencia = (inbound, contact) => {
    sendToAccount(String(inbound.accountId), 'contact_updated', {
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
const procesarPreferencia = async (inbound, preferenceData) => {
    const preference = describeUserPreference(preferenceData);
    if (!preference) return;

    if (!hasContactIdentity(preference)) {
        console.warn('Preferencia sin teléfono ni BSUID; se descarta:', { category: preferenceData?.category });
        return;
    }

    // No se crea el contacto: para darse de baja tuvo que recibir una plantilla
    // nuestra, y cada envío ya deja su contacto. Si no está, es de otra
    // herramienta que comparte el número, y no hay nada que marcar.
    const contact = await findContactByIdentity(inbound.accountId, preference);
    if (!contact) {
        console.warn('Preferencia de marketing de un contacto que no existe; se ignora.');
        return;
    }

    const updated = await applyMarketingPreference(contact, preference);
    if (updated) avisarPreferencia(inbound, updated);
};

// Procesa UN aviso de `user_id_update`: la persona cambió de número y WhatsApp
// le dio otro BSUID. Sin aplicarlo, su siguiente mensaje sin teléfono abriría
// un contacto y una conversación nuevos, separados de su historial.
const procesarCambioDeNumero = async (inbound, updateData) => {
    const update = describeUserIdUpdate(updateData);
    if (!update) return;

    const contact = await applyUserIdUpdate(inbound.accountId, update);
    if (!contact) return;

    sendToAccount(String(inbound.accountId), 'contact_updated', { id: String(contact._id) });
    console.log('Cambio de número aplicado:', { contactId: String(contact._id) });
};

// El 131050 dice que la persona está dada de baja aunque el webhook de
// `user_preferences` no haya llegado (no estar suscrito a ese campo, o que se
// perdiera). Se marca con la hora del acuse.
const marcarBajaPorFallo = async (inbound, message, timestamp) => {
    const conversation = await Conversation.findOne({ _id: message.conversationId, userId: inbound.accountId });
    if (!conversation) return;

    const contact = await getConversationContact(conversation);
    const updated = await applyMarketingPreference(contact, { optOut: true, at: timestamp });
    if (updated) avisarPreferencia(inbound, updated);
};

// Procesa UN acuse de recibo (entregado / leído / fallido).
const procesarEstado = async (inbound, statusData) => {

    const waMessageId = statusData.id;
    const status = statusData.status; // 'send' | 'delivered' | 'read' | 'failed'
    const timestamp = statusData.timestamp ? new Date(parseInt(statusData.timestamp) * 1000) : new Date();

    if(!waMessageId) return;

    const message = await Message.findOne({ waMessageId });
    if(!message) return;
    // El mensaje tiene que ser de la cuenta del número por el que llega el
    // acuse: si el número pasó de A a B, un acuse tardío de un mensaje de A no
    // lo toca ni se avisa a B (revisión de Codex del PR #35). De aquí sale
    // también la línea del aviso.
    const conversation = await Conversation.findOne({ _id: message.conversationId, userId: inbound.accountId })
        .select('lineId').lean();
    if (!conversation) return;

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

    sendToAccount(
        String(inbound.accountId),
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
            // Si salió de una campaña: su detalle se refresca con esto,
            // porque las entregas y lecturas llegan horas después de enviar.
            ...(message.campaignId && { campaignId: String(message.campaignId) }),
        },
        // A quien ve la línea de su conversación (Fase 3; revisión de Codex
        // del plan): con estados, errores y campaña, no es de toda la cuenta.
        { lineId: conversation.lineId ?? null },
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
            await marcarBajaPorFallo(inbound, message, timestamp);
        }
    }
};

export const handleWebhook = async (req, res) => {
    try {
        const body = req.body;

        if(!body.entry) return res.sendStatus(200);

        // Un aviso de Meta que no se pudo aplicar porque el candado de líneas
        // estaba ocupado: el resto del lote se procesa igual y, al final, 500
        // para que Meta lo reentregue. Es seguro: los mensajes ya guardados se
        // saltan por `waMessageId` antes de cualquier efecto, y los acuses son
        // monótonos.
        let retryBatch = false;

        for(const entry of body.entry) {
            for(const change of entry.changes ?? []){
                const value = change.value;

                // Meta retiró el acceso a un WABA (`PARTNER_REMOVED`). Va antes
                // de mirar el número: `account_update` no trae `phone_number_id`.
                if (change.field === 'account_update') {
                    try {
                        const removal = parsePartnerRemoved(entry, change);
                        if (removal) {
                            const result = await disconnectRemovedWaba(removal);
                            if (result.status === 'busy') retryBatch = true;
                            console.log('Meta retiró el acceso a un WABA:', {
                                waBusinessId: removal.waBusinessId, reason: removal.reason, status: result.status,
                                lineas: result.lineIds.length,
                            });
                        }
                    } catch (error) {
                        // Un fallo de la BD no puede perder el aviso: 500 al
                        // final para que Meta lo reentregue (revisión de Codex).
                        retryBatch = true;
                        console.error('Aviso de cuenta no aplicado, se pide a Meta que lo reentregue:', { error: error.message });
                    }
                    continue;
                }

                const phoneNumberId = value?.metadata?.phone_number_id;

                if(!phoneNumberId) continue;

                // La línea activa de ese número (Fase 2b de multi-línea), con
                // la reserva de `User` si el número no tiene `Line`. Todo lo que llega
                // es de su CUENTA (`inbound.accountId`) y va a su conversación
                // en esa línea; el token de su WABA baja los adjuntos.
                const inbound = await findInboundLine(phoneNumberId);
                if (!inbound) continue;
                // El número visible de la línea, si no lo tenía (lo usa `from` en
                // la API). Es secundario: si falla, el lote sigue.
                try {
                    await rememberDisplayPhoneNumber(inbound.lineId, value?.metadata?.display_phone_number);
                } catch (error) {
                    console.error("No se pudo guardar el número visible de la línea:", { error: error.message });
                }

                const messages = value?.messages ?? [];

                for(const messageData of messages) {
                    // Cada mensaje va en su propio try/catch a propósito. Si dejáramos
                    // subir el error, handleWebhook respondería 500 y Meta reintentaría
                    // el LOTE ENTERO: como no hay índice único en waMessageId, los que
                    // sí se guardaron se duplicarían en el chat del cliente. Ahora Meta
                    // recibe 200 y como mucho se pierde el mensaje que venía roto.
                    try {
                        await procesarEntrante(inbound, messageData, value.contacts);
                    } catch (error) {
                        console.error("Entrante descartado por error:", {
                            waMessageId: messageData?.id,
                            type: messageData?.type,
                            error: error.message,
                        });
                    }
                }

                // Lo que el negocio respondió desde la app de WhatsApp Business
                // (coexistencia). Mismo criterio: un eco roto no tumba el lote.
                const echoes = value?.message_echoes ?? [];
                for (const echoData of echoes) {
                    try {
                        await procesarEco(inbound, echoData);
                    } catch (error) {
                        console.error("Eco descartado por error:", {
                            waMessageId: echoData?.id,
                            type: echoData?.type,
                            error: error.message,
                        });
                    }
                }

                // Delivery/read status updates
                const statuses = value?.statuses ?? [];
                for(const statusData of statuses) {
                    try {
                        await procesarEstado(inbound, statusData);
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
                        await procesarPreferencia(inbound, preferenceData);
                    } catch (error) {
                        console.error("Preferencia descartada por error:", {
                            category: preferenceData?.category,
                            value: preferenceData?.value,
                            error: error.message,
                        });
                    }
                }

                // Cambios de número. Mismo requisito: el campo `user_id_update`
                // marcado en el panel de la app de Meta.
                const userIdUpdates = value?.user_id_update ?? [];
                for(const updateData of userIdUpdates) {
                    try {
                        await procesarCambioDeNumero(inbound, updateData);
                    } catch (error) {
                        // Sin BSUID ni teléfono: solo el error.
                        console.error("Cambio de número descartado por error:", { error: error.message });
                    }
                }
            }
        }

        res.sendStatus(retryBatch ? 500 : 200);
    } catch (error) {
        console.error("Error handling webhook:", error);
        res.sendStatus(500);
    }
};