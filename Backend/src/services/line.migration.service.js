import Account from '../models/account.model.js';
import Campaign from '../models/campaign.model.js';
import Conversation from '../models/conversation.model.js';
import Line from '../models/line.model.js';
import User from '../models/user.model.js';
import Waba from '../models/waba.model.js';
import { syncLinesFromOwner } from './line.service.js';
import { historicalLines, lineStateIssues, ownerConnection, sharedWabas } from '../utils/line.js';

// La lógica de `migrate:lines` (Fase 2a de multi-línea), aparte del script para
// poder probarla con Mongo. Crea las líneas de los datos de hoy y le pone a
// cada conversación la línea de SU número (no la del actual: los números
// anteriores conservan su historial en una línea desconectada). Desde la 2b,
// además cambia el índice de conversaciones a uno por contacto y línea.
//
// Idempotente. La conexión actual sale de `User` en el momento de escribir
// (`syncLinesFromOwner`), así que se puede correr con la API en marcha: una
// conexión hecha a la vez no se pisa.

const accountLabel = (owner) => owner.email ?? String(owner.accountId);

// El índice anterior a la Fase 2b: una conversación por contacto en toda la
// cuenta. Con él, un contacto no puede tener una conversación en cada línea.
const OLD_CONVERSATION_INDEX = 'conversation_contact_unique';

const hasOldConversationIndex = async () =>
    (await Conversation.collection.indexes()).some(index => index.name === OLD_CONVERSATION_INDEX);

// Primero el índice nuevo (`conversation_line_contact_unique`, el del esquema)
// y después se borra el viejo: nunca hay un momento sin ninguno de los dos.
const replaceConversationIndex = async () => {
    await Conversation.createIndexes();
    if (await hasOldConversationIndex()) await Conversation.collection.dropIndex(OLD_CONVERSATION_INDEX);
};

// Lo que hay en una cuenta y lo que la migración haría en ella.
const inspectAccount = async (owner) => {
    const accountId = owner.accountId;
    const connection = ownerConnection(owner);

    const phoneNumberIds = await Conversation.distinct('phoneNumberId', { userId: accountId });
    // `distinct` no devuelve los documentos SIN el campo: se buscan aparte.
    if (await Conversation.exists({ userId: accountId, $or: [{ phoneNumberId: null }, { phoneNumberId: '' }] })) {
        phoneNumberIds.push(null);
    }
    const lines = await Line.find({ accountId }).lean();
    const historical = historicalLines(phoneNumberIds, lines.map(line => line.phoneNumberId), connection?.phoneNumberId ?? null);

    const issues = lineStateIssues({
        owner,
        account: await Account.findById(accountId).lean(),
        lines,
        waba: connection ? await Waba.findOne({ waBusinessId: connection.waBusinessId }).lean() : null,
    });

    return {
        owner,
        phoneNumberIds: phoneNumberIds.filter(Boolean),
        historical,
        issues,
        conversations: await Conversation.countDocuments({ userId: accountId, lineId: null }),
        // Solo cuentan las de una cuenta con línea por defecto: sin conexión no
        // hay línea que ponerles.
        campaigns: connection ? await Campaign.countDocuments({ userId: accountId, lineId: null }) : 0,
    };
};

const applyAccount = async ({ owner, phoneNumberIds, historical }) => {
    const accountId = owner.accountId;
    await syncLinesFromOwner(accountId);

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

    const { defaultLineId } = await Account.findById(accountId).select('defaultLineId').lean();
    if (defaultLineId) await Campaign.updateMany({ userId: accountId, lineId: null }, { $set: { lineId: defaultLineId } });
};

/**
 * `{ dryRun, check }`: con cualquiera de los dos, solo informa. Devuelve
 * `{ stop: [{ account, reason }], pending, issues: [{ account, issues }], applied }`.
 * Con algo en `stop` no escribe nada.
 */
export const runLineMigration = async ({ dryRun = false, check = false } = {}) => {
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
        accountsOutOfSync: inspected.filter(state => state.issues.length > 0).length,
        oldConversationIndex: await hasOldConversationIndex(),
    };
    const issues = inspected
        .filter(state => state.issues.length > 0)
        .map(state => ({ account: accountLabel(state.owner), issues: state.issues }));

    if (stop.length > 0 || dryRun || check) return { stop, pending, issues, applied: false };

    for (const state of inspected) await applyAccount(state);
    await replaceConversationIndex();
    return { stop, pending, issues, applied: true };
};
