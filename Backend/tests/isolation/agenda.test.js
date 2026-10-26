// La agenda del celular de la app de WhatsApp Business (`smb_app_state_sync`):
// cada contacto se guarda en `AgendaEntry`, de la cuenta de la línea, y nombra
// (`agendaName`) al contacto de Wasmish con ese teléfono, sin tocar `name`.
// Spec: docs/superpowers/specs/2026-10-23-historial-coexistencia-design.md (§ 7).
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
    seedAccount, connectWhatsapp, postWebhook, postAgenda, request, openStream, onMeta, ANONYMOUS,
    AgendaEntry, ApiKey, Contact,
} from './helpers.js';

const { applyAgendaName, storeAgendaChange } = await import('../../src/services/agenda.service.js');
const { importHistoryPiece } = await import('../../src/services/history.import.service.js');
const { describeAgendaChange } = await import('../../src/utils/agenda.js');
const { hashApiKey } = await import('../../src/utils/crypto.js');

const nowSeconds = () => Math.floor(Date.now() / 1000);
const agendaItem = (phone, { fullName = 'Pablo Morales', firstName = 'Pablo', action = 'add', at = nowSeconds() } = {}) => ({
    type: 'contact', contact: { full_name: fullName, first_name: firstName, phone_number: phone }, action,
    metadata: { timestamp: String(at) },
});
const contactOf = (account, phone) => Contact.findOne({ userId: account.accountId, phone }).lean();

// Todo lo que se prepara con `await` va aquí arriba (ver pruebas-y-scripts.md).
const a = await seedAccount('A', { seq: 91 });
const { lineId: aLine } = await connectWhatsapp(a, { phoneNumberId: '891' });
const A_NUMBER = '891';
const b = await seedAccount('B', { seq: 92 });
await connectWhatsapp(b, { phoneNumberId: '892' });
const API_KEY = 'wm_agenda';
await ApiKey.create({ userId: a.accountId, keyHash: hashApiKey(API_KEY), keyPreview: 'wm_', name: 'agenda' });

test('la agenda nombra a los contactos que ya existen, sin tocar su name, y avisa a la UI', async () => {
    const unnamed = await Contact.create({ userId: a.accountId, phone: '593990091001', profileName: 'Pablito', source: 'inbound' });
    const stream = await openStream(a);
    try {
        const res = await postAgenda(A_NUMBER, [agendaItem(a.phone, { fullName: 'Otro nombre' }), agendaItem('+593 99 009 1001')]);
        assert.equal(res.status, 200);
        assert.ok(await stream.waitFor('contacts_updated', 2000));
    } finally {
        await stream.close();
    }

    const named = await contactOf(a, a.phone);
    assert.equal(named.name, `${a.marker} contacto`);
    assert.equal(named.agendaName, 'Otro nombre');
    const contact = await request(a, 'GET', `/contacts/${unnamed._id}`);
    assert.equal(contact.status, 200);
    assert.equal(contact.body.agendaName, 'Pablo Morales');
    assert.equal(contact.body.displayName, 'Pablo Morales');
    assert.equal(contact.body.name, null);
    assert.equal(contact.body.profileName, 'Pablito');

    // La lista lo devuelve igual, y la búsqueda lo encuentra por el de la agenda.
    const list = await request(a, 'GET', '/contacts?search=morales');
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.contacts.map(item => [item.id, item.agendaName, item.displayName]),
        [[String(unnamed._id), 'Pablo Morales', 'Pablo Morales']]);
    const entry = await AgendaEntry.findOne({ phone: '593990091001' }).lean();
    assert.equal(String(entry.userId), a.accountId);
});

test('la agenda de una cuenta no nombra al contacto de otra con el mismo teléfono', async () => {
    assert.equal((await postAgenda(A_NUMBER, [agendaItem(b.phone, { fullName: `${a.marker} agenda` })])).status, 200);
    assert.equal((await contactOf(b, b.phone)).agendaName, null);
    assert.equal(await AgendaEntry.countDocuments({ userId: b.accountId }), 0);
    // B no la ve de ninguna forma.
    const search = await request(b, 'GET', `/contacts?search=${encodeURIComponent(`${a.marker} agenda`)}`);
    assert.equal(search.body.totalCount, 0);

    // Con su propia agenda, cada una nombra a su contacto con la suya.
    assert.equal((await postAgenda('892', [agendaItem(b.phone, { fullName: 'Nombre de B' })])).status, 200);
    assert.equal((await contactOf(b, b.phone)).agendaName, 'Nombre de B');
    const created = await request(a, 'POST', '/contacts', { phone: b.phone });
    assert.equal(created.status, 201, created.text);
    assert.equal(created.body.agendaName, `${a.marker} agenda`);
});

test('los de la agenda sin chat no entran a Contactos', async () => {
    assert.equal((await postAgenda(A_NUMBER, [agendaItem('593990091099', { fullName: 'Fantasma Sinchat' })])).status, 200);
    assert.ok(await AgendaEntry.exists({ userId: a.accountId, phone: '593990091099' }));
    assert.equal(await Contact.countDocuments({ phone: '593990091099' }), 0);
    assert.equal((await request(a, 'GET', '/contacts?search=Fantasma')).body.totalCount, 0);
});

test('un contacto que escribe después nace con el nombre de la agenda, también en la bandeja', async () => {
    const phone = '593990091002';
    assert.equal((await postAgenda(A_NUMBER, [agendaItem(phone, { fullName: 'Lucía Andrade' })])).status, 200);
    const res = await postWebhook(A_NUMBER, {
        contacts: [{ wa_id: phone, profile: { name: 'Lu' } }],
        messages: [{ from: phone, id: 'wamid.agenda.entrante.1', timestamp: String(nowSeconds()), type: 'text', text: { body: 'Hola' } }],
    });
    assert.equal(res.status, 200);

    const contact = await contactOf(a, phone);
    assert.deepEqual([contact.name, contact.agendaName, contact.profileName, contact.source], [null, 'Lucía Andrade', 'Lu', 'inbound']);
    const chats = await request(a, 'GET', '/chats');
    assert.equal(chats.body.find(chat => chat.phone === phone).title, 'Lucía Andrade');
});

test('uno creado a mano toma el nombre de la agenda', async () => {
    const phone = '593990091003';
    assert.equal((await postAgenda(A_NUMBER, [agendaItem(phone, { fullName: 'Marta Agenda' })])).status, 200);
    const res = await request(a, 'POST', '/contacts', { phone, company: 'Ferretería' });
    assert.equal(res.status, 201, res.text);
    assert.equal(res.body.agendaName, 'Marta Agenda');
    assert.equal(res.body.displayName, 'Marta Agenda');
    assert.equal(res.body.name, null);
});

test('uno creado al importar toma el nombre de la agenda, también si el archivo trae otro nombre', async () => {
    assert.equal((await postAgenda(A_NUMBER, [
        agendaItem('593990091004', { fullName: 'Rosa Agenda' }), agendaItem('593990091014', { fullName: 'Juan Agenda' }),
    ])).status, 200);
    const res = await request(a, 'POST', '/contacts/import', {
        rows: [{ row: 2, phone: '0990091004' }, { row: 3, phone: '0990091014', name: 'Juan del archivo' }], country: 'EC', consent: true,
    });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.summary.created, 2);
    assert.equal((await contactOf(a, '593990091004')).agendaName, 'Rosa Agenda');
    const withName = await contactOf(a, '593990091014');
    assert.deepEqual([withName.name, withName.agendaName], ['Juan del archivo', 'Juan Agenda']);
});

test('uno creado por la API toma el nombre de la agenda', async () => {
    const phone = '593990091005';
    assert.equal((await postAgenda(A_NUMBER, [agendaItem(phone, { fullName: 'Andrés Agenda' })])).status, 200);
    onMeta(async (config) => (config.method === 'post' && config.url.endsWith('/messages')
        ? { data: { messages: [{ id: 'wamid.agenda.api.1' }] } } : undefined));
    let sent;
    try {
        sent = await request(ANONYMOUS, 'POST', '/v1/templates/send',
            { destinationNumber: phone, templateName: a.templateName }, { Authorization: `Bearer ${API_KEY}` });
    } finally {
        onMeta(null);
    }
    assert.equal(sent.status, 200, sent.text);
    const contact = await contactOf(a, phone);
    assert.deepEqual([contact.source, contact.agendaName], ['api', 'Andrés Agenda']);
});

test('uno que nace del historial toma el nombre de la agenda', async () => {
    const phone = '593990091006';
    assert.equal((await postAgenda(A_NUMBER, [agendaItem(phone, { fullName: 'Elena Agenda' })])).status, 200);
    await importHistoryPiece({
        _id: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(a.accountId), lineId: aLine,
        connectionAt: new Date(), contactPhone: phone,
        messages: [{ from: phone, id: 'wamid.agenda.historial.1', timestamp: String(nowSeconds() - 86400), type: 'text', text: { body: 'Hola' } }],
    });
    const contact = await contactOf(a, phone);
    assert.deepEqual([contact.source, contact.agendaName], ['businessApp', 'Elena Agenda']);
});

// Cada lado escribe antes de buscar al otro: una agenda que llega mientras se
// crea el contacto la aplica uno de los dos, sea cual sea el orden.
test('la agenda que llega mientras se crea el contacto queda aplicada, en los dos órdenes', async () => {
    // 1. El contacto se crea, llega la agenda (y lo nombra) y después el camino
    //    que lo creó aplica la suya: no cambia nada.
    const first = '593990091007';
    await Contact.create({ userId: a.accountId, phone: first, source: 'inbound' });
    assert.equal((await postAgenda(A_NUMBER, [agendaItem(first, { fullName: 'Primero Agenda' })])).status, 200);
    assert.equal(await applyAgendaName(a.accountId, first), null);
    assert.equal((await contactOf(a, first)).agendaName, 'Primero Agenda');

    // 2. La agenda se guarda y la aplica antes de que exista el contacto (no hay
    //    a quién); después se crea, y el camino que lo crea la aplica.
    const second = '593990091008';
    const change = describeAgendaChange(agendaItem(second, { fullName: 'Segundo Agenda' }));
    assert.equal(await storeAgendaChange(a.accountId, change), true);
    assert.equal(await applyAgendaName(a.accountId, second), null);
    const res = await request(a, 'POST', '/contacts', { phone: second });
    assert.equal(res.status, 201, res.text);
    assert.equal(res.body.agendaName, 'Segundo Agenda');
});

test('un remove vacía el nombre de la agenda y un add posterior lo vuelve a poner', async () => {
    const phone = a.phone;
    const at = nowSeconds() + 1000;
    // Con nombres: un `remove` vacía el de la agenda aunque los traiga.
    assert.equal((await postAgenda(A_NUMBER, [agendaItem(phone, { action: 'remove', at })])).status, 200);
    let contact = await contactOf(a, phone);
    assert.equal(contact.agendaName, null);
    assert.equal(contact.name, `${a.marker} contacto`);
    assert.equal((await AgendaEntry.findOne({ userId: a.accountId, phone }).lean()).removed, true);

    assert.equal((await postAgenda(A_NUMBER, [agendaItem(phone, { fullName: null, firstName: 'Solo Pila', at: at + 10 })])).status, 200);
    contact = await contactOf(a, phone);
    assert.equal(contact.agendaName, 'Solo Pila');
    assert.equal(contact.name, `${a.marker} contacto`);
});

// Meta no garantiza el orden de los webhooks.
test('un cambio viejo que llega tarde no pisa uno nuevo, ni en la agenda ni en el contacto', async () => {
    const phone = '593990091001';
    const at = nowSeconds() + 2000;
    assert.equal((await postAgenda(A_NUMBER, [agendaItem(phone, { fullName: 'Nuevo', at })])).status, 200);
    // Una reentrega del mismo cambio no hace nada.
    assert.equal((await postAgenda(A_NUMBER, [agendaItem(phone, { fullName: 'Nuevo', at })])).status, 200);
    assert.equal((await postAgenda(A_NUMBER, [agendaItem(phone, { fullName: 'Viejo', at: at - 500 })])).status, 200);

    assert.equal((await AgendaEntry.findOne({ userId: a.accountId, phone }).lean()).fullName, 'Nuevo');
    const contact = await contactOf(a, phone);
    assert.equal(contact.agendaName, 'Nuevo');
    assert.equal(contact.agendaSyncedAt.getTime(), at * 1000);
});

test('lo mal formado se salta y el resto del lote se aplica', async () => {
    const phone = '593990091009';
    await Contact.create({ userId: a.accountId, phone, source: 'manual' });
    const res = await postAgenda(A_NUMBER, [
        { type: 'contact', action: 'add', contact: { full_name: 'Sin teléfono' }, metadata: { timestamp: String(nowSeconds()) } },
        agendaItem('12345', { fullName: 'Teléfono corto' }),
        agendaItem(phone, { fullName: 'Después de los rotos', at: 'ayer' }),
        agendaItem(phone, { fullName: 'Bien formado' }),
    ]);
    assert.equal(res.status, 200);
    assert.equal((await contactOf(a, phone)).agendaName, 'Bien formado');
    assert.equal(await AgendaEntry.countDocuments({ phone: '12345' }), 0);
});

test('un fallo de la BD al guardar la agenda responde 500, y la reentrega la aplica', async () => {
    const phone = '593990091010';
    await Contact.create({ userId: a.accountId, phone, source: 'manual' });
    const item = agendaItem(phone, { fullName: 'Tras el fallo' });
    const original = AgendaEntry.updateOne;
    AgendaEntry.updateOne = async () => { throw new Error('la BD no responde'); };
    try {
        assert.equal((await postAgenda(A_NUMBER, [item])).status, 500);
    } finally {
        AgendaEntry.updateOne = original;
    }
    assert.equal((await contactOf(a, phone)).agendaName, null);

    assert.equal((await postAgenda(A_NUMBER, [item])).status, 200);
    assert.equal((await contactOf(a, phone)).agendaName, 'Tras el fallo');
});
