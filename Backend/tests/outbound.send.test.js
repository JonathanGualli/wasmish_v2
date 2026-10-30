import test from 'node:test';
import assert from 'node:assert/strict';
import { metaSendOutcome } from '../src/utils/outbound.send.js';

const metaError = (waErrorCode, waErrorDetail) => Object.assign(new Error('Request failed with status code 400'), { waErrorCode, waErrorDetail });

test('metaSendOutcome: enviado, con el wamid que devuelve Meta', async () => {
    const outcome = await metaSendOutcome(async () => ({ data: { messages: [{ id: 'wamid.1' }] } }));
    assert.deepEqual(outcome, { waMessageId: 'wamid.1', status: 'sent', errorCode: null, errorDetail: null });
});

test('metaSendOutcome: una respuesta sin wamid sigue siendo enviado, con waMessageId null', async () => {
    assert.equal((await metaSendOutcome(async () => ({ data: {} }))).waMessageId, null);
    assert.equal((await metaSendOutcome(async () => undefined)).status, 'sent');
});

test('metaSendOutcome: un rechazo de Meta no lanza: fallido, con el código como texto y el detalle', async () => {
    const outcome = await metaSendOutcome(async () => { throw metaError(131047, 'Re-engagement message'); });
    assert.deepEqual(outcome, { waMessageId: null, status: 'failed', errorCode: '131047', errorDetail: 'Re-engagement message' });
});

test('metaSendOutcome: un fallo sin código de Meta (timeout, corte) es fallido con errorCode null y el mensaje del error', async () => {
    // Las respuestas automáticas lo distinguen así de un rechazo: sin código,
    // Meta pudo recibirlo (`uncertain`).
    const outcome = await metaSendOutcome(async () => { throw new Error('timeout of 30000ms exceeded'); });
    assert.deepEqual(outcome, { waMessageId: null, status: 'failed', errorCode: null, errorDetail: 'timeout of 30000ms exceeded' });
});

test('metaSendOutcome: un fallo que no es async (lanza al llamar) también queda como fallido', async () => {
    const outcome = await metaSendOutcome(() => { throw metaError(190, 'Error validating access token'); });
    assert.equal(outcome.status, 'failed');
    assert.equal(outcome.errorCode, '190');
});
