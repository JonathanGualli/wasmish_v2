// Simula mensajes entrantes de WhatsApp contra el backend LOCAL, firmando el
// payload igual que lo hace Meta. Sirve para probar el webhook sin tocar el de
// producción — que es único por app: apuntarlo a ngrok deja a los clientes
// reales sin mensajes entrantes.
//
//   npm run webhook:simulate -- --list
//   npm run webhook:simulate -- audio
//   npm run webhook:simulate -- imagen boton ubicacion
//   npm run webhook:simulate -- --all
//   npm run webhook:simulate -- --clean          ← borra la conversación de prueba
//   npm run webhook:simulate -- baja-marketing   ← se da de baja de la publicidad
//   npm run webhook:simulate -- alta-marketing   ← vuelve a aceptarla
//   npm run webhook:simulate -- cambio-numero --new-from 593000000001
//                                                ← cambia de número y de BSUID
//   npm run webhook:simulate -- eco               ← el negocio responde desde la app
//                                                  de WhatsApp Business (coexistencia)
//   npm run webhook:simulate -- eco --username ana ← al que tiene nombre de usuario: sin teléfono
//   npm run webhook:simulate -- retiro-acceso --reason PRIMARY_INACTIVITY
//                                                ← Meta retira el acceso al WABA de la
//                                                  línea (--reason ninguno: sin motivo)
//   npm run webhook:simulate -- revoke --original <wamid>
//                                                ← el contacto borra ese mensaje
//   npm run webhook:simulate -- edit --original <wamid> --text "otro texto"
//                                                ← el contacto edita ese mensaje
//   (con --eco, lo borra o lo edita el negocio desde la app: el original es un eco)
//
// Opciones: --from <numero>  --url <http://...>  --phone-number-id <id>
//           --name <nombre de perfil>  --username <usuario>  --new-from <numero>
//           --display-number <numero visible de la línea, como lo manda Meta>
//           --reason <motivo de retiro-acceso>
//           --original <wamid del mensaje que se borra o se edita>  --text <texto editado>  --eco
//
// El wamid de cada mensaje sale en la lista «Guardado» del final.
//
// Después de cambio-numero, el contacto de prueba es el de --from <número nuevo>.
//
// Con --username el mensaje llega SIN teléfono, solo con el BSUID: así escribe
// quien activó su nombre de usuario de WhatsApp y no ha hablado con el negocio
// en 30 días. --clean con el mismo --username borra ese contacto de prueba.
//
// El backend tiene que estar levantado (npm run dev). Como el SSE dispara igual,
// los mensajes aparecen EN VIVO en el chat que tengas abierto en el navegador.
import 'dotenv/config';
import crypto from 'node:crypto';
import mongoose from 'mongoose';

import User from '../src/models/user.model.js';
import Line from '../src/models/line.model.js';
import Contact from '../src/models/contact.model.js';
import Conversation from '../src/models/conversation.model.js';
import Message from '../src/models/message.model.js';
import Waba from '../src/models/waba.model.js';

// Formas reales del webhook de Meta, una por tipo. Si alguna no cuadra con lo
// que manda Meta de verdad, corregir AQUÍ y en utils/inbound.message.js.
const MUESTRAS = {
    texto:        { type: 'text',     text: { body: '¿Siguen abiertos?' } },
    imagen:       { type: 'image',    image: { id: 'MEDIA_IMG', mime_type: 'image/jpeg', caption: 'Mira el pedido' } },
    'imagen-sola':{ type: 'image',    image: { id: 'MEDIA_IMG', mime_type: 'image/jpeg' } },
    audio:        { type: 'audio',    audio: { id: 'MEDIA_AUD', mime_type: 'audio/ogg; codecs=opus', voice: true } },
    'audio-file': { type: 'audio',    audio: { id: 'MEDIA_AUD', mime_type: 'audio/mpeg' } },
    video:        { type: 'video',    video: { id: 'MEDIA_VID', mime_type: 'video/mp4' } },
    documento:    { type: 'document', document: { id: 'MEDIA_DOC', mime_type: 'application/pdf', filename: 'factura-2026.pdf' } },
    sticker:      { type: 'sticker',  sticker: { id: 'MEDIA_STK', mime_type: 'image/webp', animated: false } },
    ubicacion:    { type: 'location', location: { latitude: -0.1807, longitude: -78.4678, name: 'Oficina', address: 'Av. Amazonas 123' } },
    contacto:     { type: 'contacts', contacts: [{ name: { formatted_name: 'Ana Pérez' }, phones: [{ phone: '+593999111222' }] }] },
    boton:        { type: 'button',   button: { text: 'Confirmar cita', payload: 'CONFIRMAR' } },
    interactivo:  { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'b1', title: 'Sí, confirmo' } } },
    reaccion:     { type: 'reaction', reaction: { message_id: 'wamid.previo', emoji: '👍' } },
    sistema:      { type: 'system',   system: { body: 'cambió de número' } },
    // Capturada de un webhook real: así llega una encuesta enviada desde el móvil.
    encuesta:     { type: 'unsupported', errors: [{ code: 131051, title: 'Message type unknown' }], unsupported: { type: 'poll_creation', raw_type: 'poll_creation' } },
    desconocido:  { type: 'nfm_reply', nfm_reply: { response_json: '{}' } },
};

// No son mensajes: van en `value.user_preferences` (webhook del mismo nombre).
// No entran en --all, que es para los tipos de mensaje. El contacto de prueba
// tiene que existir antes: manda primero un mensaje.
const PREFERENCIAS = {
    'baja-marketing': 'stop',
    'alta-marketing': 'resume',
};

// Tampoco es un mensaje: va en `value.user_id_update`. Necesita --new-from.
const CAMBIO_NUMERO = 'cambio-numero';

// Coexistencia (spec 2026-10-16): lo que el negocio responde desde la app de
// WhatsApp Business (`smb_message_echoes`) y el aviso de que Meta retiró el
// acceso al WABA de la línea (`account_update` con `PARTNER_REMOVED`).
const ECO = 'eco';
const RETIRO = 'retiro-acceso';

// Mensajes eliminados y editados (spec 2026-10-19): un mensaje que apunta al
// original con `original_message_id`. Del contacto o, con --eco, del negocio.
const CAMBIOS = ['revoke', 'edit'];

// --- argumentos -------------------------------------------------------------
const argv = process.argv.slice(2);
const opcion = (nombre, porDefecto) => {
    const i = argv.indexOf(`--${nombre}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : porDefecto;
};

const FROM = opcion('from', '593000000000');   // número de pruebas, no real
const URL_BASE = opcion('url', 'http://localhost:3001');
const phoneNumberIdArg = opcion('phone-number-id', null);
const PROFILE_NAME = opcion('name', 'Cliente de prueba');
const USERNAME = opcion('username', null);
const NEW_FROM = opcion('new-from', null);
// Meta manda en cada webhook el número visible de la línea; el backend lo
// guarda si la línea no lo tiene (lo usa `from` en la API pública).
const DISPLAY_NUMBER = opcion('display-number', '15550000000');
const REASON = opcion('reason', 'PRIMARY_INACTIVITY');
const ORIGINAL = opcion('original', null);
const EDITED_TEXT = opcion('text', 'Texto editado (simulado)');
const COMO_ECO = argv.includes('--eco');

// El BSUID que Meta generaría: país + id. Se deriva del número o del usuario
// para que el mismo contacto de prueba tenga siempre el mismo.
const simulatedUserId = (seed) => `EC.SIM${Buffer.from(seed).toString('hex')}`;
const USER_ID = simulatedUserId(USERNAME ?? FROM);
const PHONE = USERNAME ? null : FROM;
// Tras el cambio de número, el BSUID es el que tendría --from <número nuevo>.
const NEW_USER_ID = NEW_FROM && simulatedUserId(NEW_FROM);

const valoresDeOpciones = [FROM, URL_BASE, phoneNumberIdArg, PROFILE_NAME, USERNAME, NEW_FROM, DISPLAY_NUMBER, REASON, ORIGINAL, EDITED_TEXT];
const nombres = argv.filter(a => !a.startsWith('--') && !valoresDeOpciones.includes(a));
const todos = argv.includes('--all');
const listar = argv.includes('--list');
const limpiar = argv.includes('--clean');

const morir = (mensaje) => { console.error(mensaje); process.exit(1); };

if (listar) {
    console.log('Tipos disponibles:\n  ' + Object.keys(MUESTRAS).join('\n  '));
    console.log('\nPreferencias de marketing:\n  ' + Object.keys(PREFERENCIAS).join('\n  '));
    console.log(`\nOtros avisos:\n  ${CAMBIO_NUMERO}   (con --new-from <número>)\n  ${ECO}             (respuesta desde la app de WhatsApp Business)\n  ${RETIRO}   (Meta retira el acceso al WABA; --reason <motivo> o ninguno)`);
    console.log('\nBorrar o editar un mensaje (con --original <wamid>; --eco si lo hace el negocio):\n  revoke\n  edit            (--text <texto nuevo>)');
    process.exit(0);
}

const secreto = process.env.META_APP_SECRET;
if (!secreto) morir('Falta META_APP_SECRET en el .env: sin él la firma no cuadra y el webhook responde 401.');

const elegidos = todos ? Object.keys(MUESTRAS) : nombres;
if (!limpiar && elegidos.length === 0) {
    morir('Dime qué mandar.  Ej: npm run webhook:simulate -- audio boton   (o --all, o --list)');
}

const desconocidos = elegidos.filter(n => !MUESTRAS[n] && !PREFERENCIAS[n] && ![CAMBIO_NUMERO, ECO, RETIRO, ...CAMBIOS].includes(n));
if (desconocidos.length > 0) morir(`No conozco: ${desconocidos.join(', ')}.  Usa --list para ver los tipos.`);
if (elegidos.includes(CAMBIO_NUMERO) && !NEW_FROM) morir(`${CAMBIO_NUMERO} necesita el número nuevo:  --new-from 593000000001`);
if (elegidos.some(n => CAMBIOS.includes(n)) && !ORIGINAL) morir('revoke y edit necesitan el mensaje:  --original <wamid>  (sale en la lista «Guardado»)');

// --- ejecución --------------------------------------------------------------
await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/wasmish');

// El número sale de las líneas activas (desde la Fase 2c, una segunda línea no
// está en `User`) y, si no hay ninguna, del `User` que lo tenga (una BD sin migrar).
const lineaActiva = phoneNumberIdArg
    ? await Line.findOne({ phoneNumberId: phoneNumberIdArg, status: 'active' }).lean()
    : await Line.findOne({ status: 'active' }).lean();
const dueno = lineaActiva
    ? { ...await User.findOne({ accountId: lineaActiva.accountId, role: 'owner' }).select('email').lean(), accountId: lineaActiva.accountId, phoneNumberId: lineaActiva.phoneNumberId }
    : phoneNumberIdArg
        ? await User.findOne({ phoneNumberId: phoneNumberIdArg }).lean()
        : await User.findOne({ phoneNumberId: { $ne: null } }).lean();

if (!dueno) {
    morir(phoneNumberIdArg
        ? `Ninguna línea activa ni usuario de la BD local tiene el phoneNumberId ${phoneNumberIdArg}.`
        : 'Ninguna línea activa ni usuario de la BD local tiene phoneNumberId. Conéctalo en Ajustes o pásalo con --phone-number-id.');
}

const phoneNumberId = dueno.phoneNumberId;

// `dueno` es el owner de la cuenta que tiene conectado el número; los datos son de su
// cuenta (`dueno.accountId`). Toda consulta va filtrada por ella: con varias cuentas en la BD local,
// buscar solo por teléfono acierta la cuenta equivocada — y en --clean eso
// significa borrar la conversación de otro.
// Con --new-from, el contacto puede estar ya con la identidad nueva.
const testIdentity = { $or: [
    PHONE && { phone: PHONE }, { waUserId: USER_ID },
    NEW_FROM && { phone: NEW_FROM }, NEW_FROM && { waUserId: NEW_USER_ID },
].filter(Boolean) };
const senderLabel = USERNAME ? `@${USERNAME} (sin número)` : FROM;

const findTestContact = () => Contact.findOne({ userId: dueno.accountId, ...testIdentity });

// Una conversación de prueba anterior a los contactos solo se encuentra por teléfono.
const findTestConversation = async (contact) => contact
    ? Conversation.findOne({ userId: dueno.accountId, contactId: contact._id })
    : PHONE && Conversation.findOne({ userId: dueno.accountId, contactPhone: PHONE });

if (limpiar) {
    const contact = await findTestContact();
    const conv = await findTestConversation(contact);
    if (!contact && !conv) {
        console.log(`No hay contacto de prueba ${senderLabel} en la cuenta ${dueno.email}.`);
    } else {
        const { deletedCount } = conv ? await Message.deleteMany({ conversationId: conv._id }) : { deletedCount: 0 };
        if (conv) await Conversation.deleteOne({ _id: conv._id });
        if (contact) await Contact.deleteOne({ _id: contact._id });
        console.log(`Borrado el contacto de prueba ${senderLabel} en ${dueno.email}, con sus ${deletedCount} mensajes.`);
    }
    await mongoose.disconnect();
    process.exit(0);
}

console.log(`Enviando a ${URL_BASE}/api/webhook  ·  de ${senderLabel}  ·  a la cuenta ${dueno.email} (${phoneNumberId})\n`);

// El `value` de un mensaje, de un aviso de preferencia de marketing o de un
// cambio de número.
const valorDe = (nombre) => {
    const ahora = Math.floor(Date.now() / 1000);
    if (nombre === CAMBIO_NUMERO) {
        return {
            user_id_update: [{
                wa_id: NEW_FROM,
                detail: `User id for ${PROFILE_NAME} has been updated.`,
                user_id: { previous: USER_ID, current: NEW_USER_ID },
                timestamp: String(ahora),
            }],
        };
    }
    if (PREFERENCIAS[nombre]) {
        const value = PREFERENCIAS[nombre];
        return {
            user_preferences: [{
                ...(PHONE && { wa_id: PHONE }),
                user_id: USER_ID,
                detail: `User requested to ${value} marketing messages`,
                category: 'marketing_messages',
                value,
                timestamp: ahora,
            }],
        };
    }
    return {
        messages: [{
            ...(PHONE && { from: PHONE }),
            from_user_id: USER_ID,
            id: `wamid.sim.${Date.now()}.${Math.random().toString(36).slice(2)}`,
            timestamp: String(ahora),
            ...(CAMBIOS.includes(nombre) ? cambio(nombre) : MUESTRAS[nombre]),
        }],
    };
};

// El contenido de un borrado o una edición, como en la referencia de Meta.
function cambio(nombre) {
    return nombre === 'revoke'
        ? { type: 'revoke', revoke: { original_message_id: ORIGINAL } }
        : { type: 'edit', edit: { original_message_id: ORIGINAL, message: { type: 'text', text: { body: EDITED_TEXT } } } };
}

// El aviso de que Meta retiró el acceso: con la forma del ejemplo de Meta, en
// la que `entry.id` NO es el WABA (va en `waba_info.waba_id`).
const retiroDeAcceso = async () => {
    const waba = lineaActiva?.wabaId ? await Waba.findById(lineaActiva.wabaId).select('waBusinessId').lean() : null;
    if (!waba) morir(`${RETIRO} necesita una línea activa con su WABA (Fase 2c).`);
    return {
        entry: [{
            id: 'entrada-simulada', time: Math.floor(Date.now() / 1000),
            changes: [{ field: 'account_update', value: {
                event: 'PARTNER_REMOVED',
                waba_info: { waba_id: waba.waBusinessId, owner_business_id: 'negocio-simulado' },
                ...(REASON !== 'ninguno' && { disconnection_info: { reason: REASON, initiated_by: 'SYSTEM' } }),
            } }],
        }],
    };
};

// Un eco: el negocio le respondió desde la app al contacto de prueba. Como Meta,
// lleva siempre su BSUID (`to_user_id`) y el teléfono (`to`) solo si no usa
// nombre de usuario: con --username, `to` no va (el caso del 2026-10-19).
// `contenido`: un texto, o un borrado o una edición desde la app (con --eco).
const eco = (contenido = { type: 'text', text: { body: 'Respondido desde la app de WhatsApp Business (simulado)' } }) => ({
    field: 'smb_message_echoes',
    value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: DISPLAY_NUMBER, phone_number_id: phoneNumberId },
        message_echoes: [{
            from: DISPLAY_NUMBER, ...(PHONE && { to: PHONE }), to_user_id: USER_ID,
            id: `wamid.eco.${Date.now()}.${Math.random().toString(36).slice(2)}`,
            timestamp: String(Math.floor(Date.now() / 1000)),
            ...contenido,
        }],
    },
});

for (const nombre of elegidos) {
    const body = nombre === RETIRO ? JSON.stringify(await retiroDeAcceso())
        : nombre === ECO ? JSON.stringify({ entry: [{ changes: [eco()] }] })
        : CAMBIOS.includes(nombre) && COMO_ECO ? JSON.stringify({ entry: [{ changes: [eco(cambio(nombre))] }] })
        : JSON.stringify({
        entry: [{ changes: [{ value: {
            metadata: { display_phone_number: DISPLAY_NUMBER, phone_number_id: phoneNumberId },
            // Desde abril de 2026 llega siempre el BSUID; el teléfono, no siempre.
            contacts: [{
                profile: { name: PROFILE_NAME, ...(USERNAME && { username: USERNAME }) },
                ...(PHONE && { wa_id: PHONE }),
                user_id: USER_ID,
            }],
            ...valorDe(nombre),
        } }] }],
    });

    // La firma se calcula sobre los BYTES que se mandan, igual que en el
    // middleware: re-serializar cambiaría el orden de claves y no cuadraría.
    const firma = 'sha256=' + crypto.createHmac('sha256', secreto).update(body).digest('hex');

    try {
        const res = await fetch(`${URL_BASE}/api/webhook`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-hub-signature-256': firma },
            body,
        });
        const marca = res.status === 200 ? '✓' : '✗';
        console.log(`  ${marca} ${nombre.padEnd(13)} HTTP ${res.status}`);
    } catch (error) {
        morir(`\nNo pude conectar con ${URL_BASE}. ¿Está levantado el backend (npm run dev)?\n${error.message}`);
    }
}

// Lo que quedó guardado, que es lo que de verdad se quiere comprobar.
const contact = await findTestContact();
const conv = await findTestConversation(contact);
if (contact) {
    console.log(`\nContacto: ${JSON.stringify(contact.profileName)}  ·  teléfono ${contact.phone ?? '—'}  ·  BSUID ${contact.waUserId ?? '—'}`);
    console.log(`Publicidad: ${contact.marketingOptOut ? `dado de baja desde ${contact.marketingOptOutAt?.toISOString()}` : 'la acepta'}`);
}
if (conv) {
    const msgs = await Message.find({ conversationId: conv._id }).sort({ createdAt: -1 }).limit(elegidos.length).lean();
    console.log('\nGuardado (lo más nuevo arriba):');
    const marcas = (m) => `${m.deletedAt ? '  [eliminado]' : ''}${m.editedAt ? `  [editado ×${m.previousVersions?.length ?? 0}]` : ''}`;
    for (const m of msgs) {
        console.log(`  ${String(m.type).padEnd(12)} ${JSON.stringify(m.text)}${marcas(m)}  ·  ${m.waMessageId ?? '—'}`);
    }
    // Un cambio no crea mensaje: el original puede no estar entre los últimos.
    const original = ORIGINAL && await Message.findOne({ waMessageId: ORIGINAL, conversationId: conv._id }).lean();
    if (original) console.log(`\nEl original:  ${JSON.stringify(original.text)}${marcas(original)}`);
    else if (ORIGINAL) console.log(`\nEl original (${ORIGINAL}) no está en la conversación de prueba: el cambio se descartó.`);
    console.log(`\nlastMessage: ${JSON.stringify(conv.lastMessage)}  ·  sin leer: ${conv.unreadCount}`);
    console.log(`Para borrar el contacto de prueba:  npm run webhook:simulate -- --clean${USERNAME ? ` --username ${USERNAME}` : ''}`);
}

await mongoose.disconnect();
