import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

const APP_SECRET = 'app-secret-de-pruebas';
process.env.META_APP_SECRET = APP_SECRET;
const { verifyWebhookSignature } =
    await import('../src/middlewares/verify.webhook.signature.middleware.js');

const firmar = (body) =>
    'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex');

// Dobles mínimos de Express: registran qué hizo el middleware.
const mockReq = ({ rawBody, signature }) => ({
    rawBody,
    get: (header) => (header.toLowerCase() === 'x-hub-signature-256' ? signature : undefined),
});

const mockRes = () => {
    const res = { statusCode: null };
    res.sendStatus = (code) => { res.statusCode = code; return res; };
    return res;
};

const ejecutar = (req) => {
    const res = mockRes();
    let siguio = false;
    verifyWebhookSignature(req, res, () => { siguio = true; });
    return { statusCode: res.statusCode, siguio };
};

const BODY = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account', entry: [] }));

test('firma válida → pasa al handler', () => {
    const resultado = ejecutar(mockReq({ rawBody: BODY, signature: firmar(BODY) }));

    assert.equal(resultado.siguio, true);
    assert.equal(resultado.statusCode, null);
});

test('sin cabecera de firma → 401', () => {
    const resultado = ejecutar(mockReq({ rawBody: BODY, signature: undefined }));

    assert.equal(resultado.siguio, false);
    assert.equal(resultado.statusCode, 401);
});

test('firma de otro secreto → 401', () => {
    const impostor = 'sha256=' + crypto.createHmac('sha256', 'otro-secreto').update(BODY).digest('hex');
    const resultado = ejecutar(mockReq({ rawBody: BODY, signature: impostor }));

    assert.equal(resultado.siguio, false);
    assert.equal(resultado.statusCode, 401);
});

test('cuerpo alterado con firma del original → 401', () => {
    const firmaOriginal = firmar(BODY);
    const cuerpoAlterado = Buffer.from(JSON.stringify({ object: 'hackeado', entry: [] }));
    const resultado = ejecutar(mockReq({ rawBody: cuerpoAlterado, signature: firmaOriginal }));

    assert.equal(resultado.siguio, false);
    assert.equal(resultado.statusCode, 401);
});

// timingSafeEqual LANZA si los buffers tienen distinta longitud: sin el
// chequeo previo, una firma corta tumbaría el proceso en vez de dar 401.
test('firma más corta de lo esperado → 401, no una excepción', () => {
    const resultado = ejecutar(mockReq({ rawBody: BODY, signature: 'sha256=abc' }));

    assert.equal(resultado.siguio, false);
    assert.equal(resultado.statusCode, 401);
});

test('sin rawBody → 401 (el verify de express.json no corrió)', () => {
    const resultado = ejecutar(mockReq({ rawBody: undefined, signature: firmar(BODY) }));

    assert.equal(resultado.siguio, false);
    assert.equal(resultado.statusCode, 401);
});
