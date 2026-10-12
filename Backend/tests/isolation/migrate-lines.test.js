// `migrate:lines` (Fase 2a de multi-línea) contra Mongo: recorre TODAS las
// cuentas de la BD, así que vive en su propio archivo (su propio Mongo), y el
// caso que la para (un WABA compartido) va el último.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { seedAccount, mongoUri, Account, Campaign, Conversation, Line, Template, User, Waba } from './helpers.js';

const { runLineMigration } = await import('../../src/services/line.migration.service.js');

await Waba.init();
await Line.init();

const setConnection = (account, fields) => User.updateOne({ _id: account.userId }, { $set: fields });

// La conversación sembrada de cada cuenta es del número `10<seq>`.
const n = await seedAccount('N', { seq: 1 });
await setConnection(n, { tokenWhatsapp: 'cifrado-n', phoneNumberId: '101', waBusinessId: 'waba-n' });
// Una conversación de un número anterior de N (con el contacto suelto: una por contacto).
const oldConversation = await Conversation.create({
    userId: n.accountId, contactId: n.loneContactId, contactPhone: '593990000101', phoneNumberId: '8222',
});

test('migrar: cada conversación recibe la línea de su propio número', async () => {
    const result = await runLineMigration({});
    assert.deepEqual(result.stop, []);

    const current = await Line.findOne({ accountId: n.accountId, phoneNumberId: '101' }).lean();
    const old = await Line.findOne({ accountId: n.accountId, phoneNumberId: '8222' }).lean();
    assert.equal(current.status, 'active');
    assert.equal(old.status, 'disconnected');
    assert.equal(old.wabaId, null);
    assert.equal(String((await Account.findById(n.accountId).lean()).defaultLineId), String(current._id));

    assert.equal(String((await Conversation.findById(n.conversationId).lean()).lineId), String(current._id));
    assert.equal(String((await Conversation.findById(oldConversation._id).lean()).lineId), String(old._id));
    assert.equal(String((await Campaign.findById(n.campaignId).lean()).lineId), String(current._id));
    assert.equal((await Waba.findOne({ waBusinessId: 'waba-n' }).lean()).tokenWhatsapp, 'cifrado-n');
});

test('una segunda pasada no tiene nada pendiente', async () => {
    const result = await runLineMigration({ check: true });
    assert.deepEqual(result.stop, []);
    assert.deepEqual(result.pending, {
        oldLines: 0, conversations: 0, campaigns: 0, templates: 0, accountsOutOfSync: 0, oldConversationIndex: false,
    });
    assert.deepEqual(result.issues, []);
});

// Fase 2b: con el índice viejo { userId, contactId }, un contacto no puede
// tener una conversación en cada línea. Se cambia ANTES de arrancar el código
// que enruta por línea (ver el plan de la 2b, «Antes de desplegar»).
test('migrar crea el índice nuevo de conversaciones y borra el viejo; --check lo detecta antes', async () => {
    await Conversation.collection.dropIndex('conversation_line_contact_unique').catch(() => {});
    await Conversation.collection.createIndex(
        { userId: 1, contactId: 1 },
        { name: 'conversation_contact_unique', unique: true, partialFilterExpression: { contactId: { $type: 'objectId' } } },
    );
    const indexNames = async () => (await Conversation.collection.indexes()).map(index => index.name);

    const before = await runLineMigration({ check: true });
    assert.equal(before.pending.oldConversationIndex, true);
    assert.ok((await indexNames()).includes('conversation_contact_unique'), '--check no puede escribir');

    await runLineMigration({});
    const names = await indexNames();
    assert.ok(!names.includes('conversation_contact_unique'));
    assert.ok(names.includes('conversation_line_contact_unique'));
    assert.equal((await runLineMigration({ check: true })).pending.oldConversationIndex, false);
});

// Regresión que vigila (Codex, PR #13): Mongoose crea los índices del esquema
// al cargar los modelos (`autoIndex`), así que `--check` creaba el índice
// nuevo aunque dijera que no escribe.
test('el script con --check y --dry-run no toca los índices', async () => {
    await Conversation.collection.dropIndex('conversation_line_contact_unique');
    await Conversation.collection.createIndex(
        { userId: 1, contactId: 1 },
        { name: 'conversation_contact_unique', unique: true, partialFilterExpression: { contactId: { $type: 'objectId' } } },
    );
    const indexNames = async () => (await Conversation.collection.indexes()).map(index => index.name).sort();
    const before = await indexNames();

    const run = (flag) => promisify(execFile)('node', ['scripts/migrate-lines.js', flag], {
        cwd: new URL('../..', import.meta.url).pathname, env: { ...process.env, MONGO_URI: mongoUri },
    }).then(() => 0, error => error.code);

    assert.equal(await run('--check'), 1);   // queda el índice viejo
    assert.equal(await run('--dry-run'), 0);
    assert.deepEqual(await indexNames(), before);

    await runLineMigration({});   // deja los índices como los quieren los tests siguientes
});

test('--check no escribe y dice lo pendiente', async () => {
    const p = await seedAccount('P', { seq: 2 });
    await setConnection(p, { tokenWhatsapp: 'cifrado-p', phoneNumberId: '102', waBusinessId: 'waba-p' });

    const result = await runLineMigration({ check: true });
    assert.equal(result.applied, false);
    assert.equal(result.pending.accountsOutOfSync, 1);
    assert.equal(result.pending.conversations, 1);
    assert.equal(await Line.countDocuments({ accountId: p.accountId }), 0);
});

// Fase 2b: las plantillas se buscan en el WABA de la línea. Las sincronizadas
// antes de la 2a no lo tienen: sin esto, el primer envío de cada una (el OTP
// del cliente de la API) dependería de una sincronización con Meta.
test('migrar pone el WABA actual a las plantillas que no lo tienen', async () => {
    const x = await seedAccount('X', { seq: 5 });
    await setConnection(x, { tokenWhatsapp: 'cifrado-x', phoneNumberId: '105', waBusinessId: 'waba-x' });
    await Template.updateMany({ userId: x.accountId }, { $set: { waBusinessId: null } });

    assert.equal((await runLineMigration({ check: true })).pending.templates, 2);
    await runLineMigration({});
    assert.deepEqual(await Template.distinct('waBusinessId', { userId: x.accountId }), ['waba-x']);
    assert.equal((await runLineMigration({ check: true })).pending.templates, 0);
});

// Regresión que vigila (Codex, plan de la Fase 2a): con `Waba` vacía, dos owners
// con el mismo WABA en `User` pasaban la comprobación y el segundo pisaba el
// token del primero.
test('dos owners con el mismo WABA en User paran la migración sin escribir nada', async () => {
    const q = await seedAccount('Q', { seq: 3 });
    const r = await seedAccount('R', { seq: 4 });
    await setConnection(q, { tokenWhatsapp: 'cifrado-q', phoneNumberId: '103', waBusinessId: 'waba-compartido' });
    await setConnection(r, { tokenWhatsapp: 'cifrado-r', phoneNumberId: '104', waBusinessId: 'waba-compartido' });
    const before = { wabas: await Waba.countDocuments({}), lines: await Line.countDocuments({}) };

    const result = await runLineMigration({});
    assert.equal(result.applied, false);
    assert.ok(result.stop.some(entry => entry.reason.includes('waba-compartido')), JSON.stringify(result.stop));
    assert.deepEqual({ wabas: await Waba.countDocuments({}), lines: await Line.countDocuments({}) }, before);
});
