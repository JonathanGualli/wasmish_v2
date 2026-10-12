import Account from '../models/account.model.js';
import Campaign from '../models/campaign.model.js';
import Conversation from '../models/conversation.model.js';
import Line from '../models/line.model.js';
import Template from '../models/template.model.js';
import User from '../models/user.model.js';
import Waba from '../models/waba.model.js';
import { finishPendingReplace, syncLinesFromOwner, withLineLock, writeLegacyUser } from './line.service.js';
import { historicalLines, legacyUserIssues, ownerConnection, sharedWabas } from '../utils/line.js';

// La lógica de `migrate:lines` (Fase 2a de multi-línea), aparte del script para
// poder probarla con Mongo. Crea las líneas de los datos de hoy y le pone a
// cada conversación la línea de SU número (no la del actual: los números
// anteriores conservan su historial en una línea desconectada). Desde la 2b,
// además cambia el índice de conversaciones a uno por contacto y línea.
//
// Idempotente. Desde la Fase 2c, `Line` es la fuente de la conexión y `User`
// su copia: solo una cuenta SIN ninguna línea se construye desde `User`
// (`syncLinesFromOwner`, que lo relee al escribir: una conexión hecha a la vez
// no se pisa). Una cuenta con líneas nunca se reconstruye: si su `User` no es
// la copia de la línea por defecto, se repara solo si la imagen nueva marcó el
// fallo (`legacyUserStale`); si no, se informa sin elegir.

const accountLabel = (owner) => owner.email ?? String(owner.accountId);

// Los índices que ya no van. `conversation_contact_unique`, el anterior a la
// Fase 2b: una conversación por contacto en toda la cuenta, así que un contacto
// no puede tener una en cada línea. `conversation_contact_without_line_unique`,
// una versión de la 2b que no miraba el número (revisión de Codex del PR #15).
const OLD_CONVERSATION_INDEXES = ['conversation_contact_unique', 'conversation_contact_without_line_unique'];

const oldConversationIndexes = async () =>
    (await Conversation.collection.indexes()).map(index => index.name).filter(name => OLD_CONVERSATION_INDEXES.includes(name));

const hasOldConversationIndex = async () => (await oldConversationIndexes()).length > 0;

// Primero los índices nuevos (los del esquema) y después se borran los viejos:
// nunca hay un momento sin ninguno.
const replaceConversationIndex = async () => {
    await Conversation.createIndexes();
    for (const name of await oldConversationIndexes()) await Conversation.collection.dropIndex(name);
};

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

// El WABA de la línea por defecto de una cuenta con líneas, leído AHORA.
const defaultLineOf = async (accountId) => {
    const account = await Account.findById(accountId).select('defaultLineId').lean();
    const line = account?.defaultLineId ? await Line.findById(account.defaultLineId).lean() : null;
    const waba = line?.wabaId ? await Waba.findById(line.wabaId).lean() : null;
    return { line, waba };
};

// Lo que hay en una cuenta y lo que la migración haría en ella.
const inspectAccount = async (owner) => {
    const accountId = owner.accountId;
    const connection = ownerConnection(owner);
    const account = await Account.findById(accountId).lean();
    const lines = await Line.find({ accountId }).lean();
    const withoutLines = lines.length === 0;

    const phoneNumberIds = await Conversation.distinct('phoneNumberId', { userId: accountId });
    // `distinct` no devuelve los documentos SIN el campo: se buscan aparte.
    if (await Conversation.exists({ userId: accountId, $or: [{ phoneNumberId: null }, { phoneNumberId: '' }] })) {
        phoneNumberIds.push(null);
    }
    // El número actual de una cuenta sin líneas lo crea `syncLinesFromOwner`.
    const historical = historicalLines(
        phoneNumberIds, lines.map(line => line.phoneNumberId), withoutLines ? connection?.phoneNumberId ?? null : null,
    );

    let issues = [];
    let templateWaba = null;
    if (withoutLines) {
        if (connection) issues = ['la cuenta no tiene líneas: se crean desde User'];
        templateWaba = connection?.waBusinessId ?? null;
    } else {
        const defaultLine = lines.find(line => sameId(line._id, account?.defaultLineId)) ?? null;
        const waba = defaultLine?.wabaId ? await Waba.findById(defaultLine.wabaId).lean() : null;
        issues = legacyUserIssues({ owner, defaultLine, waba, hasActiveLines: lines.some(line => line.status === 'active') });
        templateWaba = defaultLine?.status === 'active' ? waba?.waBusinessId ?? null : null;
    }
    const stale = !withoutLines && Boolean(account?.legacyUserStale);
    const replacePending = Boolean(account?.pendingReplace);

    return {
        owner,
        withoutLines,
        stale,
        phoneNumberIds: phoneNumberIds.filter(Boolean),
        historical,
        issues: [
            ...issues,
            ...(stale ? ['la copia en User falló (legacyUserStale): migrar la rehace desde Line'] : []),
            ...(replacePending ? ['un cambio de número quedó a medias (pendingReplace): migrar lo termina'] : []),
        ],
        replacePending,
        conversations: await Conversation.countDocuments({ userId: accountId, lineId: null }),
        // Solo cuentan las de una cuenta con línea por defecto: sin conexión no
        // hay línea que ponerles.
        campaigns: (withoutLines ? connection : account?.defaultLineId)
            ? await Campaign.countDocuments({ userId: accountId, lineId: null }) : 0,
        // Las sincronizadas antes de la 2a no tienen WABA, y desde la 2b se
        // buscan por él. Reciben el de la línea por defecto.
        templates: templateWaba ? await Template.countDocuments({ userId: accountId, waBusinessId: null }) : 0,
    };
};

const applyAccount = async ({ owner, withoutLines, stale, phoneNumberIds, historical }) => {
    const accountId = owner.accountId;
    // Con el candado y comprobando OTRA VEZ que no hay líneas: la API pudo
    // conectar alguna después de la inspección, y `syncLinesFromOwner` dejaría
    // activa solo la de `User` (revisión de Codex del PR #19). El candado
    // también termina un reemplazo de número que se cortara.
    await withLineLock(accountId, async () => {
        await finishPendingReplace(accountId);
        if (withoutLines && ownerConnection(owner) && !await Line.exists({ accountId })) {
            await syncLinesFromOwner(accountId);
        }
    });

    for (const phoneNumberId of historical.create) {
        await Line.updateOne(
            { accountId, phoneNumberId },
            { $setOnInsert: { status: 'disconnected', wabaId: null } },
            { upsert: true },
        );
    }

    const lines = await Line.find({ accountId }).select('_id phoneNumberId').lean();
    const lineByPhone = new Map(lines.map(line => [line.phoneNumberId, line._id]));
    for (const phoneNumberId of phoneNumberIds) {
        const lineId = lineByPhone.get(phoneNumberId);
        if (lineId) await Conversation.updateMany({ userId: accountId, phoneNumberId, lineId: null }, { $set: { lineId } });
    }

    // La línea por defecto y su WABA de AHORA, no los de la lectura del
    // principio: la cuenta puede haber cambiado mientras corría la migración.
    const { line: defaultLine, waba } = await defaultLineOf(accountId);
    if (defaultLine) await Campaign.updateMany({ userId: accountId, lineId: null }, { $set: { lineId: defaultLine._id } });
    if (defaultLine?.status === 'active' && waba) {
        await Template.updateMany({ userId: accountId, waBusinessId: null }, { $set: { waBusinessId: waba.waBusinessId } });
    }

    if (stale) await writeLegacyUser(accountId);
};

/**
 * `{ dryRun, check }`: con cualquiera de los dos, solo informa. `afterInspect`
 * es SOLO para los tests: se llama entre la inspección y la escritura. Devuelve
 * `{ stop: [{ account, reason }], pending, issues: [{ account, issues }], applied }`.
 * Con algo en `stop` no escribe nada.
 */
export const runLineMigration = async ({ dryRun = false, check = false, afterInspect = null } = {}) => {
    const owners = await User.find({ role: 'owner' })
        .select('email accountId tokenWhatsapp phoneNumberId waBusinessId').lean();
    const wabas = await Waba.find({}).select('waBusinessId accountId').lean();

    const stop = sharedWabas([...owners, ...wabas]).map(({ waBusinessId, accountIds }) => ({
        account: owners.filter(owner => accountIds.includes(String(owner.accountId))).map(accountLabel).join(', '),
        reason: `el WABA ${waBusinessId} está en ${accountIds.length} cuentas`,
    }));

    const inspected = [];
    for (const owner of owners) {
        const state = await inspectAccount(owner);
        if (state.historical.stop) stop.push({ account: accountLabel(owner), reason: state.historical.stop });
        inspected.push(state);
    }

    const pending = {
        oldLines: inspected.reduce((sum, state) => sum + (state.historical.create?.length ?? 0), 0),
        conversations: inspected.reduce((sum, state) => sum + state.conversations, 0),
        campaigns: inspected.reduce((sum, state) => sum + state.campaigns, 0),
        templates: inspected.reduce((sum, state) => sum + state.templates, 0),
        accountsOutOfSync: inspected.filter(state => !state.stale && !state.replacePending && state.issues.length > 0).length,
        legacyUserStale: inspected.filter(state => state.stale).length,
        pendingReplace: inspected.filter(state => state.replacePending).length,
        oldConversationIndex: await hasOldConversationIndex(),
    };
    const issues = inspected
        .filter(state => state.issues.length > 0)
        .map(state => ({ account: accountLabel(state.owner), issues: state.issues }));

    if (stop.length > 0 || dryRun || check) return { stop, pending, issues, applied: false };

    await afterInspect?.();
    for (const state of inspected) await applyAccount(state);
    await replaceConversationIndex();
    return { stop, pending, issues, applied: true };
};
