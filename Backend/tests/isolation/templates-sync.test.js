// La sincronización de plantillas con Meta (spec del detalle de plantillas,
// § 4.1 y § 4.2): recorre todas las páginas, guarda el pie y lo nuevo, marca
// las borradas en Meta solo con un sync completo y dentro de su WABA, y
// `GET /templates?fresh=1` sincroniza si pasaron más de 10 minutos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seedAccount, request, connectWhatsapp, onMeta, metaCalls, ANONYMOUS, ApiKey, Message, Template, Waba } from './helpers.js';

const { hashApiKey } = await import('../../src/utils/crypto.js');

const templatesUrl = (account) => `/waba-${account.label}/message_templates`;
const metaTemplate = (id, extra = {}) => ({
    id, name: id.replace(/-/g, '_'), category: 'UTILITY', status: 'APPROVED', language: 'es',
    parameter_format: 'POSITIONAL', components: [{ type: 'BODY', text: 'hola' }], ...extra,
});
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60 * 1000);
const syncCallsTo = (url, from) => metaCalls.slice(from).filter(call => call.url === url).length;

// Lo que se prepara con `await` va antes del primer `test()` (ver templates.test.js).
const p = await seedAccount('P', { seq: 21 });
await connectWhatsapp(p);
const m = await seedAccount('M', { seq: 22 });
await connectWhatsapp(m);
const f = await seedAccount('F', { seq: 23 });
await connectWhatsapp(f);
const r = await seedAccount('R', { seq: 24 });
await connectWhatsapp(r);
// Dos WABA en la misma cuenta: el sync del primero no toca las del segundo.
const x = await seedAccount('X', { seq: 25, maxLines: 2 });
await connectWhatsapp(x, { phoneNumberId: '7625' });
await connectWhatsapp(x, { phoneNumberId: '7626', waBusinessId: 'waba-X2' });
// Una plantilla borrada en Meta, para enviar desde el chat y desde la API pública.
const d = await seedAccount('D', { seq: 26 });
await connectWhatsapp(d);
await ApiKey.create({ userId: d.accountId, keyHash: hashApiKey('wm_prueba_d'), keyPreview: 'wm_prueba', name: 'v1' });
await Template.create({
    userId: x.accountId, waBusinessId: 'waba-X2', templateId: 'tpl-x2', name: 'del_segundo_waba',
    language: 'es', category: 'MARKETING', status: 'APPROVED', bodyText: 'x2', header: null, buttons: [],
});

const withMeta = async (responder, fn) => {
    onMeta(responder);
    try {
        return await fn();
    } finally {
        onMeta(null);
    }
};

test('el sync recorre las páginas y pide los campos', async () => {
    const seen = [];
    const res = await withMeta(async (config) => {
        if (config.method !== 'get' || config.url !== templatesUrl(p)) return undefined;
        seen.push(config.params);
        return config.params?.after === 'p2'
            ? { data: { data: [metaTemplate('tpl-p-2')] } }
            : { data: { data: [metaTemplate('tpl-p-1')], paging: { next: 'https://graph.test/next', cursors: { after: 'p2' } } } };
    }, () => request(p, 'GET', '/templates/sync'));
    assert.equal(res.status, 200, res.text);

    assert.equal(seen.length, 2);
    assert.equal(seen[0].limit, 100);
    assert.ok(seen[0].fields.split(',').includes('quality_score'), seen[0].fields);
    assert.equal(seen[0].after, undefined);
    assert.equal(seen[1].after, 'p2');
    assert.ok(await Template.exists({ templateId: 'tpl-p-1', userId: p.accountId }));
    assert.ok(await Template.exists({ templateId: 'tpl-p-2', userId: p.accountId }));
});

test('el sync guarda el pie, los ejemplos, la calidad y el motivo del rechazo', async () => {
    const res = await withMeta(async (config) => (config.method === 'get' && config.url === templatesUrl(p)
        ? { data: { data: [metaTemplate('tpl-p-pie', {
            status: 'REJECTED',
            rejected_reason: 'INVALID_FORMAT',
            quality_score: { score: 'YELLOW' },
            components: [
                { type: 'BODY', text: 'Hola {{1}}', example: { body_text: [['Ana']] } },
                { type: 'FOOTER', text: 'Responde BAJA' },
            ],
        })] } }
        : undefined), () => request(p, 'GET', '/templates/sync'));
    assert.equal(res.status, 200, res.text);

    const template = await Template.findOne({ templateId: 'tpl-p-pie' }).lean();
    assert.equal(template.footerText, 'Responde BAJA');
    assert.deepEqual(template.bodyExamples, [{ key: '1', example: 'Ana' }]);
    assert.equal(template.qualityScore, 'YELLOW');
    assert.equal(template.rejectedReason, 'INVALID_FORMAT');
    assert.equal(template.deletedInMetaAt, null);
});

test('una que ya no llega se marca, y se desmarca si reaparece', async () => {
    const only = (ids) => async (config) => (config.method === 'get' && config.url === templatesUrl(m)
        ? { data: { data: ids.map(id => metaTemplate(id)) } } : undefined);

    const first = await withMeta(only([m.templateId]), () => request(m, 'GET', '/templates/sync'));
    assert.equal(first.status, 200, first.text);
    const gone = await Template.findOne({ templateId: m.imageTemplateId }).lean();
    assert.ok(gone.deletedInMetaAt instanceof Date, 'la que no llegó no quedó marcada');
    assert.equal((await Template.findOne({ templateId: m.templateId }).lean()).deletedInMetaAt, null);
    assert.ok((await Waba.findOne({ waBusinessId: 'waba-M' }).lean()).templatesSyncedAt instanceof Date);

    // Sigue en la lista, con la marca: la página la enseña como borrada.
    const list = await request(m, 'GET', '/templates');
    assert.ok(list.body.find(t => t.templateId === m.imageTemplateId)?.deletedInMetaAt, list.text);

    const second = await withMeta(only([m.templateId, m.imageTemplateId]), () => request(m, 'GET', '/templates/sync'));
    assert.equal(second.status, 200, second.text);
    assert.equal((await Template.findOne({ templateId: m.imageTemplateId }).lean()).deletedInMetaAt, null);
});

// Review Focus 1 del plan: un sync que falla a mitad no da nada por borrado.
test('si Meta falla en la página 2, se guarda la 1 y no se marca nada', async () => {
    const res = await withMeta(async (config) => {
        if (config.method !== 'get' || config.url !== templatesUrl(f)) return undefined;
        if (config.params?.after === 'p2') throw new Error('Meta caída en la página 2');
        return { data: { data: [metaTemplate('tpl-f-1')], paging: { next: 'https://graph.test/next', cursors: { after: 'p2' } } } };
    }, () => request(f, 'GET', '/templates/sync'));
    assert.notEqual(res.status, 200, res.text);

    assert.ok(await Template.exists({ templateId: 'tpl-f-1', userId: f.accountId }));
    assert.equal(await Template.countDocuments({ userId: f.accountId, deletedInMetaAt: { $ne: null } }), 0);
    assert.equal((await Waba.findOne({ waBusinessId: 'waba-F' }).lean()).templatesSyncedAt, null);
});

// Review Focus 3 del plan: las borradas se buscan dentro del WABA sincronizado.
test('el sync de un WABA no marca las del otro WABA de la cuenta', async () => {
    // Solo el primero está caducado: `fresh` sincroniza ese y no el segundo.
    await Waba.updateOne({ waBusinessId: 'waba-X' }, { $set: { templatesSyncedAt: minutesAgo(30) } });
    await Waba.updateOne({ waBusinessId: 'waba-X2' }, { $set: { templatesSyncedAt: new Date() } });
    const res = await withMeta(async (config) => (config.method === 'get' && config.url === templatesUrl(x)
        ? { data: { data: [] } } : undefined), () => request(x, 'GET', '/templates?fresh=1'));
    assert.equal(res.status, 200, res.text);

    assert.ok((await Template.findOne({ templateId: x.templateId }).lean()).deletedInMetaAt instanceof Date);
    assert.equal((await Template.findOne({ templateId: 'tpl-x2' }).lean()).deletedInMetaAt, null);
});

test('GET /templates?fresh=1 sincroniza solo si pasaron más de 10 minutos', async () => {
    const responder = async (config) => (config.method === 'get' && config.url === templatesUrl(r)
        ? { data: { data: [metaTemplate(r.templateId), metaTemplate(r.imageTemplateId)] } } : undefined);

    await Waba.updateOne({ waBusinessId: 'waba-R' }, { $set: { templatesSyncedAt: minutesAgo(11) } });
    let from = metaCalls.length;
    const stale = await withMeta(responder, () => request(r, 'GET', '/templates?fresh=1'));
    assert.equal(stale.status, 200, stale.text);
    assert.equal(syncCallsTo(templatesUrl(r), from), 1, 'con 11 minutos no sincronizó');

    await Waba.updateOne({ waBusinessId: 'waba-R' }, { $set: { templatesSyncedAt: minutesAgo(1) } });
    from = metaCalls.length;
    const recent = await withMeta(responder, () => request(r, 'GET', '/templates?fresh=1'));
    assert.equal(recent.status, 200, recent.text);
    assert.equal(syncCallsTo(templatesUrl(r), from), 0, 'con 1 minuto sincronizó');

    await Waba.updateOne({ waBusinessId: 'waba-R' }, { $set: { templatesSyncedAt: minutesAgo(30) } });
    from = metaCalls.length;
    const plain = await withMeta(responder, () => request(r, 'GET', '/templates'));
    assert.equal(plain.status, 200, plain.text);
    assert.equal(syncCallsTo(templatesUrl(r), from), 0, 'sin fresh sincronizó');
});

// Spec § 4.4: una plantilla marcada como borrada en Meta no se envía.
const sendsTo = (account, from) => metaCalls.slice(from).filter(call => call.method === 'post' && call.url === `/99${account.seq}/messages`).length;
const markDeleted = (templateId) => Template.updateOne({ templateId }, { $set: { deletedInMetaAt: new Date() } });

test('una plantilla borrada en Meta no se envía', async () => {
    await markDeleted(d.templateId);
    const from = metaCalls.length;
    const res = await withMeta(async (config) => {
        // El sync de último momento: Meta ya no la tiene.
        if (config.method === 'get' && config.url === templatesUrl(d)) return { data: { data: [metaTemplate(d.imageTemplateId)] } };
        if (config.method === 'post' && config.url === `/99${d.seq}/messages`) return { data: { messages: [{ id: 'wamid.no' }] } };
        return undefined;
    }, () => request(d, 'POST', '/chats/template', { templateName: d.templateName, destinationNumber: '593990002601' }));
    assert.equal(res.status, 404, res.text);
    assert.equal(sendsTo(d, from), 0);
});

// Revisión de Codex del plan, 1. Regresión que vigila: con solo
// `deletedInMetaAt: null` en `findTemplate`, la marcada no se encuentra, el
// sync de último momento falla, `syncOk = false` y el envío sigue hasta Meta.
test('una borrada no se envía aunque falle el sync, ni por el chat ni por la API', async () => {
    await markDeleted(d.templateId);
    const responder = async (config) => {
        if (config.method === 'get' && config.url === templatesUrl(d)) throw new Error('Meta caída');
        if (config.method === 'post' && config.url === `/99${d.seq}/messages`) return { data: { messages: [{ id: 'wamid.no' }] } };
        return undefined;
    };
    const from = metaCalls.length;
    const viaChat = await withMeta(responder, () =>
        request(d, 'POST', '/chats/template', { templateName: d.templateName, destinationNumber: '593990002602' }));
    assert.equal(viaChat.status, 404, viaChat.text);
    const viaApi = await withMeta(responder, () => request(ANONYMOUS, 'POST', '/v1/templates/send',
        { destinationNumber: '593990002603', templateName: d.templateName }, { Authorization: 'Bearer wm_prueba_d' }));
    assert.equal(viaApi.status, 404, viaApi.text);
    assert.equal(sendsTo(d, from), 0);
});

test('una borrada que volvió a Meta se envía, y el mensaje guarda su templateId', async () => {
    await markDeleted(d.templateId);
    const res = await withMeta(async (config) => {
        if (config.method === 'get' && config.url === templatesUrl(d)) {
            return { data: { data: [metaTemplate(d.templateId, { name: d.templateName }), metaTemplate(d.imageTemplateId)] } };
        }
        if (config.method === 'post' && config.url === `/99${d.seq}/messages`) return { data: { messages: [{ id: 'wamid.volvio' }] } };
        return undefined;
    }, () => request(d, 'POST', '/chats/template', { templateName: d.templateName, destinationNumber: '593990002604' }));
    assert.equal(res.status, 200, res.text);
    assert.equal((await Template.findOne({ templateId: d.templateId }).lean()).deletedInMetaAt, null);
    const sent = await Message.findOne({ waMessageId: 'wamid.volvio' }).lean();
    assert.equal(sent.templateId, d.templateId);
    assert.equal(sent.templateName, d.templateName);
});
