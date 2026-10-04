import test from 'node:test';
import assert from 'node:assert/strict';

import {
    describeInboundContact,
    hasContactIdentity,
    mergeContactUpdates,
    whatsappRecipient,
    contactDisplayName,
} from '../src/utils/contact.identity.js';

const PHONE = '593999111222';
const BSUID = 'EC.13491208655302741918';

test('lee teléfono, BSUID y perfil del lote de Meta', () => {
    const identity = describeInboundContact(
        [{ profile: { name: 'Ana', username: 'ana.p' }, wa_id: PHONE, user_id: BSUID }],
        { from: PHONE, from_user_id: BSUID, type: 'text' },
    );

    assert.deepEqual(identity, {
        phone: PHONE, waUserId: BSUID, username: 'ana.p', profileName: 'Ana', referral: null,
    });
});

// Regresión: antes del BSUID, un mensaje sin `from` hacía fallar la creación de
// la conversación (contactPhone era required) y el mensaje se perdía.
test('un mensaje sin teléfono se identifica por su BSUID', () => {
    const identity = describeInboundContact(
        [{ profile: { name: 'Ana', username: 'ana.p' }, user_id: BSUID }],
        { from_user_id: BSUID, type: 'text' },
    );

    assert.equal(identity.phone, null);
    assert.equal(identity.waUserId, BSUID);
    assert.equal(hasContactIdentity(identity), true);
});

test('con varios remitentes, cada mensaje se lleva SU perfil', () => {
    const contacts = [
        { profile: { name: 'Ana' }, wa_id: '111', user_id: 'EC.1' },
        { profile: { name: 'Luis' }, wa_id: '222', user_id: 'EC.2' },
    ];

    assert.equal(describeInboundContact(contacts, { from: '222' }).profileName, 'Luis');
    // Sin casar con ninguno no se adivina: sería el nombre de otra persona.
    assert.equal(describeInboundContact(contacts, { from: '333' }).profileName, null);
});

test('sin teléfono ni BSUID no hay identidad', () => {
    const identity = describeInboundContact(undefined, { type: 'text' });
    assert.equal(hasContactIdentity(identity), false);
});

test('guarda el anuncio que trajo al contacto', () => {
    const identity = describeInboundContact([], {
        from: PHONE,
        referral: { source_type: 'ad', source_id: '120', headline: 'Promo', ctwa_clid: 'clid1' },
    });

    assert.equal(identity.referral.sourceType, 'ad');
    assert.equal(identity.referral.sourceId, '120');
    assert.equal(identity.referral.ctwaClid, 'clid1');
});

// El nombre lo puso alguien a mano: lo que llegue de WhatsApp no lo pisa.
test('nunca pisa el nombre que ya tiene el contacto', () => {
    const current = { name: 'Juan (mayorista)', profileName: 'Juan', phone: PHONE };
    const changes = mergeContactUpdates(current, { name: 'Juan Pérez', profileName: 'Juan 🌵' });

    assert.equal(changes.name, undefined);
    assert.equal(changes.profileName, 'Juan 🌵');
});

test('rellena el nombre de un contacto que no tiene ninguno', () => {
    assert.deepEqual(mergeContactUpdates({ name: null }, { name: '  Ana  ' }), { name: 'Ana' });
});

test('la identidad solo se rellena, no se reemplaza', () => {
    const changes = mergeContactUpdates(
        { phone: PHONE, waUserId: null },
        { phone: '593000000000', waUserId: BSUID },
    );

    assert.deepEqual(changes, { waUserId: BSUID });
});

test('sin cambios devuelve un objeto vacío', () => {
    const current = { phone: PHONE, waUserId: BSUID, username: 'ana.p', profileName: 'Ana', name: 'Ana' };
    assert.deepEqual(mergeContactUpdates(current, { ...current }), {});
});

// Las plantillas de autenticación solo aceptan el teléfono: si lo hay, manda él.
test('se envía por teléfono si lo hay, y por BSUID si no', () => {
    assert.deepEqual(whatsappRecipient({ phone: PHONE, waUserId: BSUID }), { to: PHONE });
    assert.deepEqual(whatsappRecipient({ phone: null, waUserId: BSUID }), { recipient: BSUID });
    assert.equal(whatsappRecipient({}), null);
});

test('el nombre a mostrar sigue el orden nombre, perfil, usuario, teléfono', () => {
    assert.equal(contactDisplayName({ name: 'Ana', profileName: 'A', username: 'ana.p', phone: PHONE }), 'Ana');
    assert.equal(contactDisplayName({ profileName: 'Ana 🌸', phone: PHONE }), 'Ana 🌸');
    assert.equal(contactDisplayName({ username: 'ana.p' }), '@ana.p');
    assert.equal(contactDisplayName({ name: '  ', phone: PHONE }), PHONE);
    assert.equal(contactDisplayName({}), 'Contacto de WhatsApp');
});
