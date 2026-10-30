// Plantillas y archivos de cabecera: B no ve las plantillas de A, no les cambia
// ni les quita el archivo, no sube archivos a su nombre ni descarga los suyos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seedAccount, request, assertNoLeak, assertHasOwn, connectWhatsapp, onMeta, openStream, Line, Template, TemplateMedia, PNG } from './helpers.js';

const a = await seedAccount('A', { seq: 1 });
const b = await seedAccount('B', { seq: 2 });

const headerMediaOf = async (account) =>
    String((await Template.findOne({ templateId: account.imageTemplateId }).lean()).headerMedia);
const upload = { 'Content-Type': 'image/png', 'X-Filename': 'cabecera.png' };

// Lo que se prepara con `await` va antes del primer `test()`: preparado entre
// tests, si tardaba más que los ya registrados, el runner los daba por
// terminados y el `after` de helpers.js cerraba Mongo a mitad (el fallo del CI
// de master tras el PR #43, en push.test.js).

// Fase 2c: una cuenta con dos líneas de WABA distintos.
const w = await seedAccount('W', { seq: 6, maxLines: 2 });
const { lineId: wFirst } = await connectWhatsapp(w, { phoneNumberId: '7591' });          // waba-W, el de las sembradas
const { lineId: wSecond } = await connectWhatsapp(w, { phoneNumberId: '7592', waBusinessId: 'waba-W2' });
await Template.create({
    userId: w.accountId, waBusinessId: 'waba-W2', templateId: 'tpl-w2', name: 'del_segundo_waba',
    language: 'es', category: 'MARKETING', status: 'APPROVED', bodyText: 'w2', header: null, buttons: [],
});
await Template.create({
    userId: w.accountId, waBusinessId: 'waba-sin-linea', templateId: 'tpl-w3', name: 'de_un_waba_sin_linea',
    language: 'es', category: 'MARKETING', status: 'APPROVED', bodyText: 'w3', header: null, buttons: [],
});
const namesOf = (res) => res.body.map(template => template.name).sort();

// Una cuenta con WhatsApp conectado, para enviar una plantilla desde el chat.
const tr = await seedAccount('TR', { seq: 8 });
await connectWhatsapp(tr);

test('GET /templates: B no ve las plantillas de A', async () => {
    assertNoLeak(await request(b, 'GET', '/templates'), a);
    assertHasOwn(await request(a, 'GET', '/templates'), a);
});

test('PUT /templates/:templateId/header-media: B no cambia el archivo de una de A', async () => {
    const mediaBefore = await TemplateMedia.countDocuments({ userId: b.accountId });
    const asB = await request(b, 'PUT', `/templates/${a.imageTemplateId}/header-media`, PNG, upload);
    assert.equal(asB.status, 404);
    assert.equal(await headerMediaOf(a), a.headerMediaId);
    assert.equal(await TemplateMedia.countDocuments({ userId: b.accountId }), mediaBefore);

    const asA = await request(a, 'PUT', `/templates/${a.imageTemplateId}/header-media`, PNG, upload);
    assert.equal(asA.status, 200, asA.text);
});

test('POST /templates/:templateId/header-media/files: B no sube archivos para una de A', async () => {
    const asB = await request(b, 'POST', `/templates/${a.imageTemplateId}/header-media/files`, PNG, upload);
    assert.equal(asB.status, 404);

    const asA = await request(a, 'POST', `/templates/${a.imageTemplateId}/header-media/files`, PNG, upload);
    assert.equal(asA.status, 201, asA.text);
});

test('GET /templates/media/:id: B no descarga el archivo de cabecera de A', async () => {
    const asB = await request(b, 'GET', `/templates/media/${a.headerMediaId}`);
    assert.equal(asB.status, 404);
    assert.ok(!asB.text.includes('PNG'), 'B recibió los bytes del archivo de A');

    const asA = await request(a, 'GET', `/templates/media/${a.headerMediaId}`);
    assert.equal(asA.status, 200, asA.text);
});

test('DELETE /templates/:templateId/header-media: B no le quita el archivo a una de A', async () => {
    const before = await headerMediaOf(a);
    const asB = await request(b, 'DELETE', `/templates/${a.imageTemplateId}/header-media`);
    assert.equal(asB.status, 404);
    assert.equal(await headerMediaOf(a), before);

    const asA = await request(a, 'DELETE', `/templates/${a.imageTemplateId}/header-media`);
    assert.equal(asA.status, 200, asA.text);
});

// Fase 2a: cada plantilla sabe su WABA (todavía no se busca por él).
test('sincronizar guarda el WABA en cada plantilla', async () => {
    const t = await seedAccount('T', { seq: 3 });
    await connectWhatsapp(t);
    onMeta(async (config) => (config.method === 'get' && config.url === '/waba-T/message_templates'
        ? { data: { data: [{
            id: 'tpl-sync-T', name: 'sync_t', category: 'MARKETING', status: 'APPROVED', language: 'es',
            components: [{ type: 'BODY', text: 'hola' }],
        }] } }
        : undefined));
    try {
        const res = await request(t, 'GET', '/templates/sync');
        assert.equal(res.status, 200, res.text);
    } finally {
        onMeta(null);
    }
    const template = await Template.findOne({ templateId: 'tpl-sync-T' }).lean();
    assert.equal(String(template.userId), t.accountId);
    assert.equal(template.waBusinessId, 'waba-T');
});

// Fase 2b: las plantillas se buscan en el WABA de la línea.
test('GET /templates solo lista las del WABA de la línea', async () => {
    const u = await seedAccount('U', { seq: 4 });
    await connectWhatsapp(u);
    await Template.create({
        userId: u.accountId, waBusinessId: 'waba-otro', templateId: 'tpl-otro-U', name: 'de_otro_waba',
        language: 'es', category: 'MARKETING', status: 'APPROVED', bodyText: 'otro', header: null, buttons: [],
    });

    const res = await request(u, 'GET', '/templates');
    assert.equal(res.status, 200, res.text);
    const names = res.body.map(template => template.name);
    assert.ok(names.includes(u.templateName), res.text);
    assert.ok(!names.includes('de_otro_waba'), res.text);
});

// Regresión que vigila (plan de la 2b, Review Focus 5): una plantilla
// sincronizada antes de la 2a no tiene WABA, no aparece en la búsqueda, y el
// envío tiene que sincronizarla y salir igual.
test('una plantilla sin WABA se sincroniza y sale', async () => {
    const v = await seedAccount('V', { seq: 5 });
    await connectWhatsapp(v);
    await Template.updateOne({ templateId: v.templateId }, { $set: { waBusinessId: null } });
    onMeta(async (config) => {
        if (config.method === 'get' && config.url === '/waba-V/message_templates') {
            return { data: { data: [{
                id: v.templateId, name: v.templateName, category: 'MARKETING', status: 'APPROVED', language: 'es',
                parameter_format: 'POSITIONAL', components: [{ type: 'BODY', text: 'hola' }],
            }] } };
        }
        if (config.method === 'post' && config.url === `/99${v.seq}/messages`) return { data: { messages: [{ id: 'wamid.jit' }] } };
        return undefined;
    });
    try {
        const res = await request(v, 'POST', '/chats/template', { templateName: v.templateName, destinationNumber: '593990001234' });
        assert.equal(res.status, 200, res.text);
    } finally {
        onMeta(null);
    }
    assert.equal((await Template.findOne({ templateId: v.templateId }).lean()).waBusinessId, 'waba-V');
});


test('GET /templates?lineId=: solo las del WABA de esa línea; de otra cuenta → 404', async () => {
    const second = await request(w, 'GET', `/templates?lineId=${wSecond}`);
    assert.equal(second.status, 200, second.text);
    assert.deepEqual(namesOf(second), ['del_segundo_waba']);
    const first = await request(w, 'GET', `/templates?lineId=${wFirst}`);
    assert.ok(namesOf(first).includes(w.templateName));
    assert.ok(!namesOf(first).includes('del_segundo_waba'));

    const asB = await request(b, 'GET', `/templates?lineId=${wSecond}`);
    assert.equal(asB.status, 404, asB.text);
    assert.equal((await request(b, 'GET', '/templates?lineId=no-es-un-id')).status, 404);
});

test('GET /templates sin lineId: las de los WABA con línea activa, cada una con su waBusinessId', async () => {
    const res = await request(w, 'GET', '/templates');
    assert.equal(res.status, 200, res.text);
    const names = namesOf(res);
    assert.ok(names.includes(w.templateName));
    assert.ok(names.includes('del_segundo_waba'));
    assert.ok(!names.includes('de_un_waba_sin_linea'));
    assert.equal(res.body.find(template => template.name === 'del_segundo_waba').waBusinessId, 'waba-W2');
    assert.ok(await Line.exists({ _id: wSecond, status: 'active' }));
});

// Revisión de Codex del plan de citas y reacciones, 9: el `message_created` de
// una plantilla se armaba a mano y no traía `canReply`: «Responder» no salía hasta
// recargar. Desde que el final del envío es uno solo (`recordOutboundMessage`), es
// `serializeMessage`, como el de un texto.
test('el message_created de una plantilla enviada trae canReply', async () => {
    onMeta(async (config) => (config.method === 'post' && config.url === `/99${tr.seq}/messages`
        ? { data: { messages: [{ id: `wamid.plantilla.${Date.now()}` }] } } : undefined));
    const stream = await openStream(tr);
    try {
        const res = await request(tr, 'POST', '/chats/template', { templateName: tr.templateName, destinationNumber: '593990001235' });
        assert.equal(res.status, 200, res.text);
        assert.ok(await stream.waitFor('"canReply":true', 2000), 'el message_created de la plantilla no trae canReply');
        assert.ok(await stream.waitFor('"canReact":false', 0));
    } finally {
        onMeta(null);
        await stream.close();
    }
});
