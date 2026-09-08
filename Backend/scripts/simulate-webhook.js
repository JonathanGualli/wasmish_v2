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
//
// Opciones: --from <numero>  --url <http://...>  --phone-number-id <id>
//
// El backend tiene que estar levantado (npm run dev). Como el SSE dispara igual,
// los mensajes aparecen EN VIVO en el chat que tengas abierto en el navegador.
import 'dotenv/config';
import crypto from 'node:crypto';
import mongoose from 'mongoose';

import User from '../src/models/user.model.js';
import Conversation from '../src/models/conversation.model.js';
import Message from '../src/models/message.model.js';

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

// --- argumentos -------------------------------------------------------------
const argv = process.argv.slice(2);
const opcion = (nombre, porDefecto) => {
    const i = argv.indexOf(`--${nombre}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : porDefecto;
};

const FROM = opcion('from', '593000000000');   // número de pruebas, no real
const URL_BASE = opcion('url', 'http://localhost:3001');
const phoneNumberIdArg = opcion('phone-number-id', null);

const nombres = argv.filter(a => !a.startsWith('--') && a !== FROM && a !== URL_BASE && a !== phoneNumberIdArg);
const todos = argv.includes('--all');
const listar = argv.includes('--list');
const limpiar = argv.includes('--clean');

const morir = (mensaje) => { console.error(mensaje); process.exit(1); };

if (listar) {
    console.log('Tipos disponibles:\n  ' + Object.keys(MUESTRAS).join('\n  '));
    process.exit(0);
}

const secreto = process.env.META_APP_SECRET;
if (!secreto) morir('Falta META_APP_SECRET en el .env: sin él la firma no cuadra y el webhook responde 401.');

const elegidos = todos ? Object.keys(MUESTRAS) : nombres;
if (!limpiar && elegidos.length === 0) {
    morir('Dime qué mandar.  Ej: npm run webhook:simulate -- audio boton   (o --all, o --list)');
}

const desconocidos = elegidos.filter(n => !MUESTRAS[n]);
if (desconocidos.length > 0) morir(`No conozco: ${desconocidos.join(', ')}.  Usa --list para ver los tipos.`);

// --- ejecución --------------------------------------------------------------
await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/wasmish');

const dueno = phoneNumberIdArg
    ? await User.findOne({ phoneNumberId: phoneNumberIdArg }).lean()
    : await User.findOne({ phoneNumberId: { $ne: null } }).lean();

if (!dueno) {
    morir(phoneNumberIdArg
        ? `Ningún usuario de la BD local tiene el phoneNumberId ${phoneNumberIdArg}.`
        : 'Ningún usuario de la BD local tiene phoneNumberId. Conéctalo en Ajustes o pásalo con --phone-number-id.');
}

const phoneNumberId = dueno.phoneNumberId;

// Toda consulta de conversación va filtrada por userId: con varias cuentas en la
// BD local, buscar solo por contactPhone acierta la cuenta equivocada — y en
// --clean eso significa borrar la conversación de otro.
const filtroConversacion = { userId: dueno._id, contactPhone: FROM };

if (limpiar) {
    const conv = await Conversation.findOne(filtroConversacion);
    if (!conv) {
        console.log(`No hay conversación de prueba con ${FROM} en la cuenta ${dueno.email}.`);
    } else {
        const { deletedCount } = await Message.deleteMany({ conversationId: conv._id });
        await Conversation.deleteOne({ _id: conv._id });
        console.log(`Borrada la conversación de ${FROM} en ${dueno.email}, con sus ${deletedCount} mensajes.`);
    }
    await mongoose.disconnect();
    process.exit(0);
}

console.log(`Enviando a ${URL_BASE}/api/webhook  ·  de ${FROM}  ·  a la cuenta ${dueno.email} (${phoneNumberId})\n`);

for (const nombre of elegidos) {
    const body = JSON.stringify({
        entry: [{ changes: [{ value: {
            metadata: { phone_number_id: phoneNumberId },
            messages: [{
                from: FROM,
                id: `wamid.sim.${Date.now()}.${Math.random().toString(36).slice(2)}`,
                timestamp: String(Math.floor(Date.now() / 1000)),
                ...MUESTRAS[nombre],
            }],
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
const conv = await Conversation.findOne(filtroConversacion).lean();
if (conv) {
    const msgs = await Message.find({ conversationId: conv._id }).sort({ createdAt: -1 }).limit(elegidos.length).lean();
    console.log('\nGuardado (lo más nuevo arriba):');
    for (const m of msgs) {
        console.log(`  ${String(m.type).padEnd(12)} ${JSON.stringify(m.text)}`);
    }
    console.log(`\nlastMessage: ${JSON.stringify(conv.lastMessage)}  ·  sin leer: ${conv.unreadCount}`);
    console.log(`Para borrar la conversación de prueba:  npm run webhook:simulate -- --clean`);
}

await mongoose.disconnect();
