// Los tests de aislamiento nunca llegan a Meta: el transporte de whatsappApi
// está sustituido en helpers.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { metaCalls, onMeta } from './helpers.js';

const { whatsappApi } = await import('../../src/libs/whatsapp.js');

test('con respuesta preparada, la llamada devuelve sus datos y queda anotada', async () => {
    onMeta(async (config) => (config.url === '/prueba' ? { data: { ok: true } } : undefined));
    const res = await whatsappApi.get('/prueba');
    assert.deepEqual(res.data, { ok: true });
    assert.deepEqual(metaCalls.at(-1), { method: 'get', url: '/prueba' });
    onMeta(null);
});
