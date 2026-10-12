// Plantillas y archivos de cabecera: B no ve las plantillas de A, no les cambia
// ni les quita el archivo, no sube archivos a su nombre ni descarga los suyos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seedAccount, request, assertNoLeak, assertHasOwn, connectWhatsapp, onMeta, Template, TemplateMedia, PNG } from './helpers.js';

const a = await seedAccount('A', { seq: 1 });
const b = await seedAccount('B', { seq: 2 });

const headerMediaOf = async (account) =>
    String((await Template.findOne({ templateId: account.imageTemplateId }).lean()).headerMedia);
const upload = { 'Content-Type': 'image/png', 'X-Filename': 'cabecera.png' };

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
