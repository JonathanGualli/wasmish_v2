// Lo de la cuenta: las API keys de A (con una, B enviaría plantillas como A) y
// el panel de admin, que solo abre un superadmin.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seedAccount, request, assertNoLeak, assertHasOwn, ApiKey } from './helpers.js';

const a = await seedAccount('A', { seq: 1 });
const b = await seedAccount('B', { seq: 2 });
const admin = await seedAccount('ADMIN', { seq: 3, rol: 'superadmin' });

test('GET /api-key: B no ve las API keys de A', async () => {
    assertNoLeak(await request(b, 'GET', '/api-key'), a);
    assertHasOwn(await request(a, 'GET', '/api-key'), a);
});

test('DELETE /api-key/:id: B no revoca una API key de A', async () => {
    const asB = await request(b, 'DELETE', `/api-key/${a.apiKeyId}`);
    assert.equal(asB.status, 404);
    assert.ok(await ApiKey.findById(a.apiKeyId).lean(), 'la API key de A desapareció');

    const asA = await request(a, 'DELETE', `/api-key/${a.apiKeyId}`);
    assert.equal(asA.status, 200, asA.text);
});

for (const url of ['/admin/stats', '/admin/clients']) {
    test(`GET ${url}: solo el superadmin`, async () => {
        assert.equal((await request(b, 'GET', url)).status, 403);
        const asAdmin = await request(admin, 'GET', url);
        assert.equal(asAdmin.status, 200, asAdmin.text);
    });
}
