import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { isUntouchedEchoContact } from '../src/utils/contact.merge.js';

// El contacto que crea un eco: solo el teléfono que manda Meta.
const echoContact = (fields = {}) => ({
    phone: '573152086520', waUserId: null, name: null, email: null, company: null, notes: null,
    tags: [], marketingOptOut: false, marketingPreferenceAt: null, referral: null, ...fields,
});
const onlyEchoes = { echoMessages: 9, otherMessages: 0, notes: 0, campaignRecipients: 0 };

// Regresión que vigila: los ecos de una persona con nombre de usuario creaban un
// segundo contacto que nunca se juntaba con el suyo (2026-10-19).
test('un contacto con solo teléfono y solo ecos es un contacto de eco', () => {
    assert.equal(isUntouchedEchoContact(echoContact(), onlyEchoes), true);
});

test('sin ecos no es un contacto de eco', () => {
    assert.equal(isUntouchedEchoContact(echoContact(), { ...onlyEchoes, echoMessages: 0 }), false);
    assert.equal(isUntouchedEchoContact(echoContact(), {}), false);
});

test('con un entrante o un envío desde Wasmish ya no es solo de los ecos', () => {
    assert.equal(isUntouchedEchoContact(echoContact(), { ...onlyEchoes, otherMessages: 1 }), false);
});

test('lo que puso quien usa Wasmish lo saca: nombre, correo, empresa, notas, etiquetas', () => {
    for (const fields of [
        { name: 'Albert' }, { email: 'a@b.co' }, { company: 'Imprenta' }, { notes: 'Paga a 30 días' },
        { tags: [new mongoose.Types.ObjectId()] },
    ]) {
        assert.equal(isUntouchedEchoContact(echoContact(fields), onlyEchoes), false, JSON.stringify(fields));
    }
    assert.equal(isUntouchedEchoContact(echoContact(), { ...onlyEchoes, notes: 1 }), false);
    assert.equal(isUntouchedEchoContact(echoContact(), { ...onlyEchoes, campaignRecipients: 1 }), false);
});

test('con BSUID, baja de publicidad o anuncio no es un contacto de eco', () => {
    for (const fields of [
        { waUserId: 'CO.1433329108757971' }, { marketingOptOut: true },
        { marketingPreferenceAt: new Date() }, { referral: { sourceType: 'ad' } },
    ]) {
        assert.equal(isUntouchedEchoContact(echoContact(fields), onlyEchoes), false, JSON.stringify(fields));
    }
});

test('sin teléfono o sin contacto, false', () => {
    assert.equal(isUntouchedEchoContact(echoContact({ phone: null }), onlyEchoes), false);
    assert.equal(isUntouchedEchoContact(null, onlyEchoes), false);
});
