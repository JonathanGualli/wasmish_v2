// Base de los tests de aislamiento entre cuentas: un Mongo en memoria (la
// versión de producción, fijada en `config.mongodbMemoryServer` del
// package.json), la app de verdad escuchando en un puerto libre y dos cuentas,
// A y B, con un ejemplar de cada cosa. Cada test hace que B pida lo de A.
//
// Nada llega a Meta: A no tiene WhatsApp conectado, el worker de campañas no
// arranca (vive en index.js) y CAMPAIGN_DRY_RUN está encendido.
import { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// La config se lee al importar: hay que fijarla antes del `import` de la app.
process.env.NODE_ENV = 'test';
process.env.TOKEN_SECRET = 'secreto-de-pruebas';
process.env.CAMPAIGN_DRY_RUN = 'true';
process.env.MEDIA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'wasmish-isolation-'));

const mongod = await MongoMemoryServer.create();
await mongoose.connect(mongod.getUri());

const { default: app } = await import('../../src/app.js');
const { createAccessToken } = await import('../../src/libs/jwt.js');
const { encrypt } = await import('../../src/utils/crypto.js');
const load = async (file) => (await import(`../../src/models/${file}`)).default;

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

const server = app.listen(0);
const baseUrl = `http://127.0.0.1:${server.address().port}/api`;

after(async () => {
    server.close();
    await mongoose.disconnect();
    await mongod.stop();
    await fs.rm(process.env.MEDIA_DIR, { recursive: true, force: true });
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
export const seedAccount = async (label, { rol = 'admin', seq = 1 } = {}) => {
    const marker = `SECRETO-${label}`;
    const user = await User.create({ name: marker, email: `${label.toLowerCase()}@pruebas.local`, password: 'x', rol });

    const tag = await Tag.create({ userId: user._id, name: `${marker} etiqueta`, key: `${label.toLowerCase()}-etiqueta` });
    const contact = await Contact.create({
        userId: user._id, phone: `59399000000${seq}`, name: `${marker} contacto`, tags: [tag._id], source: 'manual',
    });
    // Un contacto sin conversación: el único que se puede borrar.
    const loneContact = await Contact.create({ userId: user._id, phone: `59399000010${seq}`, name: `${marker} suelto` });

    // Ventana cerrada: el único mensaje del contacto es de hace dos días (sin
    // `lastInboundAt`, el chat lo busca en sus mensajes). Así el texto libre se
    // frena con un 409 antes de llegar al token de WhatsApp, que A no tiene.
    const conversation = await Conversation.create({
        userId: user._id, contactId: contact._id, contactPhone: contact.phone, phoneNumberId: `10${seq}`,
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
        userId: user._id, file: headerFile, mimeType: 'image/png', filename: `${marker}.png`, size: PNG.length,
    });
    const templateFields = {
        userId: user._id, language: 'es', category: 'MARKETING', status: 'APPROVED',
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
        userId: user._id, name: `${marker} campaña`, totalRecipients: 1, dryRun: true,
        template: { templateId: template.templateId, name: template.name, language: 'es', category: 'MARKETING', bodyText: template.bodyText },
    });
    await CampaignRecipient.create({ campaignId: campaign._id, userId: user._id, contactId: contact._id });

    const apiKey = await ApiKey.create({
        userId: user._id, keyHash: `hash-${label}`, keyPreview: `wm_${marker}`, name: `${marker} key`,
    });

    return {
        label, marker, userId: String(user._id),
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

/** Una cuenta con WhatsApp «conectado», para lo que lo exige antes de nada (crear una campaña). */
export const connectWhatsapp = (account) =>
    User.updateOne({ _id: account.userId }, { tokenWhatsapp: encrypt('token-de-pruebas'), phoneNumberId: '999' });

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
    return { status: response.status, body: json, text };
};

/** Ni la marca ni ningún id de `owner` aparecen en la respuesta. */
export const assertNoLeak = (response, owner) => {
    const ids = [
        owner.userId, owner.tagId, owner.contactId, owner.loneContactId, owner.conversationId,
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
