// Base de los tests de aislamiento entre cuentas: un Mongo en memoria (la
// versión de producción, fijada en `config.mongodbMemoryServer` del
// package.json), la app de verdad escuchando en un puerto libre y dos cuentas,
// A y B, con un ejemplar de cada cosa. Cada test hace que B pida lo de A.
//
// Nada llega a Meta: A no tiene WhatsApp conectado, el worker de campañas no
// arranca (vive en index.js) y CAMPAIGN_DRY_RUN está encendido.
//
// La cuenta de cada una NO tiene el `_id` de su usuario. En producción
// coinciden (el owner crea la cuenta con su mismo `_id`), y por eso un
// `req.user.id` o un `user._id` usado como cuenta funcionaría allí «de
// casualidad». Aquí no: los datos cuelgan de la cuenta, y el control de cada
// test (A llega a lo suyo) falla si el código busca por la persona.
import { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// La config se lee al importar: hay que fijarla antes del `import` de la app.
process.env.NODE_ENV = 'test';
process.env.TOKEN_SECRET = 'secreto-de-pruebas';
process.env.CAMPAIGN_DRY_RUN = 'true';
// Con él, `postWebhook` firma el cuerpo igual que Meta.
process.env.META_APP_SECRET = 'secreto-meta-pruebas';
process.env.MEDIA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'wasmish-isolation-'));

const mongod = await MongoMemoryServer.create();
// Para los scripts que se prueban en su propio proceso (migrate:lines).
export const mongoUri = mongod.getUri();
await mongoose.connect(mongoUri);

const { default: app } = await import('../../src/app.js');
const { createAccessToken } = await import('../../src/libs/jwt.js');
const { encrypt } = await import('../../src/utils/crypto.js');
const { whatsappApi } = await import('../../src/libs/whatsapp.js');
const { syncLinesFromOwner } = await import('../../src/services/line.service.js');

// Meta falso. Todas las llamadas a Meta pasan por `whatsappApi`, así que
// cambiarle el transporte basta para que ningún test llegue a la red, ni
// siquiera si una regresión mueve una comprobación por detrás de la llamada.
// Un test prepara las respuestas con `onMeta`; lo que no tiene respuesta
// lanza y queda en `unexpectedMetaCalls`, y el `after` de abajo hace fallar
// el archivo aunque el controlador se haya tragado el error.
export const metaCalls = [];
const unexpectedMetaCalls = [];
let metaResponder = null;

/** `responder(config) → { data, status? } | undefined`; `undefined` = llamada no prevista. `null` lo quita. */
export const onMeta = (responder) => { metaResponder = responder; };

whatsappApi.defaults.adapter = async (config) => {
    const call = { method: config.method, url: config.url };
    metaCalls.push(call);
    const reply = await metaResponder?.(config);
    if (!reply) {
        unexpectedMetaCalls.push(call);
        throw new Error(`Llamada a Meta no prevista en un test: ${config.method?.toUpperCase()} ${config.url}`);
    }
    return { data: reply.data, status: reply.status ?? 200, statusText: 'OK', headers: {}, config, request: {} };
};
const load = async (file) => (await import(`../../src/models/${file}`)).default;

export const Account = await load('account.model.js');
export const User = await load('user.model.js');
export const Contact = await load('contact.model.js');
export const Tag = await load('tag.model.js');
export const Conversation = await load('conversation.model.js');
export const Message = await load('message.model.js');
export const Template = await load('template.model.js');
export const TemplateMedia = await load('template.media.model.js');
export const Campaign = await load('campaign.model.js');
export const CampaignRecipient = await load('campaign.recipient.model.js');
export const ApiKey = await load('api.keys.model.js');
export const Waba = await load('waba.model.js');
export const Line = await load('line.model.js');

const server = app.listen(0);
const baseUrl = `http://127.0.0.1:${server.address().port}/api`;

after(async () => {
    server.close();
    await mongoose.disconnect();
    await mongod.stop();
    await fs.rm(process.env.MEDIA_DIR, { recursive: true, force: true });
    // Al final: si fallara antes de cerrar, Mongo y el servidor quedarían
    // abiertos y el proceso no terminaría nunca.
    assert.deepEqual(unexpectedMetaCalls, [], 'un test llamó a Meta sin respuesta preparada');
});

// La firma de un PNG y poco más: basta para pasar la comprobación de formato.
export const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const writeMedia = async (file) => {
    const fullPath = path.join(process.env.MEDIA_DIR, file);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, PNG);
};

/**
 * Una cuenta con un ejemplar de cada cosa. Todo lo que se ve lleva la marca
 * `SECRETO-<label>`: si aparece en una respuesta de la otra cuenta, se filtró.
 * `seq` separa los teléfonos y los nombres de archivo de las dos cuentas.
 */
export const seedAccount = async (label, { isSuperadmin = false, seq = 1 } = {}) => {
    const marker = `SECRETO-${label}`;
    // La cuenta y su owner con `_id` distintos (ver la cabecera).
    const user = new User({
        name: marker, email: `${label.toLowerCase()}@pruebas.local`, password: 'x',
        accountId: new mongoose.Types.ObjectId(), role: 'owner', isSuperadmin,
    });
    await Account.create({ _id: user.accountId, name: marker, ownerId: user._id });
    await user.save();
    const accountId = user.accountId;

    const tag = await Tag.create({ userId: accountId, name: `${marker} etiqueta`, key: `${label.toLowerCase()}-etiqueta` });
    const contact = await Contact.create({
        userId: accountId, phone: `59399000000${seq}`, name: `${marker} contacto`, tags: [tag._id], source: 'manual',
    });
    // Un contacto sin conversación: el único que se puede borrar.
    const loneContact = await Contact.create({ userId: accountId, phone: `59399000010${seq}`, name: `${marker} suelto` });

    // Ventana cerrada: el único mensaje del contacto es de hace dos días (sin
    // `lastInboundAt`, el chat lo busca en sus mensajes). Así el texto libre se
    // frena con un 409 antes de llegar al token de WhatsApp, que A no tiene.
    const conversation = await Conversation.create({
        userId: accountId, contactId: contact._id, contactPhone: contact.phone, phoneNumberId: `10${seq}`,
        lastMessage: `${marker} último`, unreadCount: 3,
    });
    const mediaFile = `${seq}000.png`;
    await writeMedia(mediaFile);
    const message = await Message.create({
        conversationId: conversation._id, direction: 'inbound', sender: 'them', text: `${marker} mensaje`,
        type: 'image', mediaId: `${seq}000`, mimeType: 'image/png', mediaFile,
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });

    const headerFile = `templates/${label.toLowerCase()}.png`;
    await writeMedia(headerFile);
    const headerMedia = await TemplateMedia.create({
        userId: accountId, file: headerFile, mimeType: 'image/png', filename: `${marker}.png`, size: PNG.length,
    });
    // Con el WABA que deja `connectWhatsapp` (como las deja `migrate:lines`):
    // desde la Fase 2b las plantillas se buscan en el WABA de la línea.
    const templateFields = {
        userId: accountId, waBusinessId: `waba-${label}`, language: 'es', category: 'MARKETING', status: 'APPROVED',
        parameterFormat: 'POSITIONAL', buttons: [],
    };
    const template = await Template.create({
        ...templateFields, templateId: `tpl-texto-${label}`, name: `${marker.toLowerCase()}_texto`,
        bodyText: `${marker} hola`, header: null,
    });
    const imageTemplate = await Template.create({
        ...templateFields, templateId: `tpl-imagen-${label}`, name: `${marker.toLowerCase()}_imagen`,
        bodyText: `${marker} con imagen`, header: { format: 'IMAGE', text: null }, headerMedia: headerMedia._id,
    });

    const campaign = await Campaign.create({
        userId: accountId, name: `${marker} campaña`, totalRecipients: 1, dryRun: true,
        template: { templateId: template.templateId, name: template.name, language: 'es', category: 'MARKETING', bodyText: template.bodyText },
    });
    await CampaignRecipient.create({ campaignId: campaign._id, userId: accountId, contactId: contact._id });

    const apiKey = await ApiKey.create({
        userId: accountId, keyHash: `hash-${label}`, keyPreview: `wm_${marker}`, name: `${marker} key`,
    });

    return {
        label, marker, seq, userId: String(user._id), accountId: String(accountId),
        token: await createAccessToken({ id: String(user._id) }),
        tagId: String(tag._id),
        contactId: String(contact._id),
        loneContactId: String(loneContact._id),
        phone: contact.phone,
        conversationId: String(conversation._id),
        messageId: String(message._id),
        headerMediaId: String(headerMedia._id),
        templateId: template.templateId,
        templateName: template.name,
        imageTemplateId: imageTemplate.templateId,
        campaignId: String(campaign._id),
        apiKeyId: String(apiKey._id),
    };
};

/**
 * Una cuenta con WhatsApp «conectado», para lo que lo exige antes de nada (crear una campaña).
 * El número es distinto por cuenta (`99<seq>`): un número solo puede estar en una. Como una
 * conexión de verdad, guarda el WABA (`waba-<label>` si no se da otro) y refleja `Waba` y `Line`.
 */
export const connectWhatsapp = async (account, { waBusinessId = `waba-${account.label}` } = {}) => {
    await User.updateOne({ _id: account.userId }, {
        tokenWhatsapp: encrypt('token-de-pruebas'), phoneNumberId: `99${account.seq}`, waBusinessId,
    });
    await syncLinesFromOwner(account.accountId);
};

/**
 * Una petición con la sesión de `account`. `body` puede ser un objeto (JSON)
 * o un Buffer (los endpoints que reciben el archivo crudo).
 */
export const request = async (account, method, url, body, headers = {}) => {
    const raw = Buffer.isBuffer(body);
    const response = await fetch(baseUrl + url, {
        method,
        headers: {
            Cookie: `token=${account.token}`,
            ...(body !== undefined && !raw ? { 'Content-Type': 'application/json' } : {}),
            ...headers,
        },
        body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* binario o vacío */ }
    return { status: response.status, body: json, text, setCookie: response.headers.get('set-cookie') };
};

/** La sesión que deja una respuesta con `Set-Cookie: token=…` (registro o login), lista para `request`. */
export const sessionFrom = (response) => ({ token: /token=([^;]+)/.exec(response.setCookie ?? '')?.[1] ?? '' });

/** Sin sesión: registro, login y la API pública. */
export const ANONYMOUS = { token: '' };

/**
 * Un webhook de Meta, firmado con HMAC-SHA256 sobre los bytes que se mandan
 * (como `verifyWebhookSignature` espera). `value` es el de un solo cambio, sin
 * `metadata`: la pone `phoneNumberId`.
 */
export const postWebhook = async (phoneNumberId, value) => {
    const body = JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: phoneNumberId }, ...value } }] }] });
    const signature = 'sha256=' + crypto.createHmac('sha256', process.env.META_APP_SECRET).update(body).digest('hex');
    const response = await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signature },
        body,
    });
    return { status: response.status };
};

/**
 * Una conexión SSE abierta con la sesión de `account`. `waitFor(text, ms)` se
 * resuelve con `true` en cuanto lo recibido contiene `text`, o con `false` al
 * pasar `ms`. `close()` la cierra.
 */
export const openStream = async (account) => {
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/stream`, { headers: { Cookie: `token=${account.token}` }, signal: controller.signal });
    assert.equal(response.status, 200);
    let received = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const pump = (async () => {
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) return;
                received += decoder.decode(value, { stream: true });
            }
        } catch { /* cerrada */ }
    })();
    const waitFor = async (text, ms) => {
        const deadline = Date.now() + ms;
        while (Date.now() < deadline) {
            if (received.includes(text)) return true;
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        return received.includes(text);
    };
    const close = async () => { controller.abort(); await pump; };
    // El servidor la registra al recibirla: se espera a su primer comentario.
    await waitFor(': connected', 2000);
    return { waitFor, close };
};

/** Ni la marca ni ningún id de `owner` aparecen en la respuesta. */
export const assertNoLeak = (response, owner) => {
    const ids = [
        owner.userId, owner.accountId, owner.tagId, owner.contactId, owner.loneContactId, owner.conversationId,
        owner.messageId, owner.headerMediaId, owner.templateId, owner.imageTemplateId, owner.campaignId, owner.apiKeyId,
    ];
    for (const secret of [owner.marker, owner.phone, ...ids]) {
        assert.ok(!response.text.includes(secret), `la respuesta trae «${secret}», que es de la cuenta ${owner.label}`);
    }
};

/** La respuesta trae la marca de `owner`: el control de que el endpoint sí devuelve lo propio. */
export const assertHasOwn = (response, owner) => {
    assert.equal(response.status, 200, response.text);
    assert.ok(response.text.includes(owner.marker), `la respuesta no trae nada de la cuenta ${owner.label}`);
};
