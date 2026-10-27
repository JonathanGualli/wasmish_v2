import mongoose from 'mongoose';

// ---------------------------------------------------------------------------
// Quién puede hacer qué en una cuenta (Fase 3 de multi-línea; la matriz está en
// la spec, § 3.3). Un rol por persona y, para supervisor y agente, una lista de
// líneas. La autoridad es el backend: el frontend recibe `permissionsFor` en la
// sesión y decide con eso qué enseña.
// ---------------------------------------------------------------------------

export const ROLES = ['owner', 'admin', 'supervisor', 'agent'];

// Las acciones que algún rol NO tiene. Lo que no está aquí lo hace cualquier
// rol en sus líneas: ver y responder conversaciones, ver y editar contactos,
// ver plantillas y ver sus líneas.
export const PERMISSIONS = {
    'contacts.import': ['owner', 'admin', 'supervisor'],
    'contacts.delete': ['owner', 'admin', 'supervisor'],
    // Crear, renombrar y borrar etiquetas, y etiquetar en bloque.
    'tags.manage': ['owner', 'admin', 'supervisor'],
    // Sincronizar y subir o quitar la cabecera.
    'templates.manage': ['owner', 'admin', 'supervisor'],
    // Ver, crear, pausar, reanudar y cancelar, en sus líneas.
    'campaigns.manage': ['owner', 'admin', 'supervisor'],
    'apiKeys.manage': ['owner', 'admin'],
    // Conectar (los dos caminos), renombrar, hacer por defecto, desconectar y ver el PIN.
    'lines.manage': ['owner', 'admin'],
    'team.manage': ['owner', 'admin'],
    // Las respuestas automáticas: son de toda la cuenta, no de unas líneas.
    'autoReplies.manage': ['owner', 'admin'],
    // Asignar o transferir CUALQUIER conversación de sus líneas, y resolver sus
    // solicitudes de transferencia (Fase 4). El agente, solo las suyas (`canReassign`).
    'conversations.assign': ['owner', 'admin', 'supervisor'],
};

const ALL_LINES_ROLES = new Set(['owner', 'admin', 'api']);

/** Si `auth` puede hacer `action`. Falso para una acción desconocida y para la API key. */
export const can = (auth, action) => Boolean(auth && PERMISSIONS[action]?.includes(auth.role));

/** Las líneas a su alcance: `null` = todas (owner, admin y la API key). */
export const lineScope = (auth) => (ALL_LINES_ROLES.has(auth?.role) ? null : (auth?.lineIds ?? []).map(String));

/** Si la línea `lineId` está a su alcance. Una conversación sin línea solo la ven quienes ven todas. */
export const inLineScope = (auth, lineId) => {
    const scope = lineScope(auth);
    if (scope === null) return true;
    return lineId != null && scope.includes(String(lineId));
};

/**
 * Solo las líneas: lo que se suma a `{ userId: accountId }` cuando no hace
 * falta ver la conversación (pedir que te la transfieran, Fase 4).
 */
export const conversationLineScope = (auth) => {
    const scope = lineScope(auth);
    if (scope === null) return {};
    return { lineId: { $in: scope.map(id => new mongoose.Types.ObjectId(id)) } };
};

// El agente ve las sin asignar y las suyas, nunca las de sus compañeros
// (Fase 4; spec § 3.3). El supervisor ve todas las de sus líneas.
const seesOnlyOwnAndUnassigned = (auth) => auth?.role === 'agent';

// `assignedTo` como texto: un ObjectId, un usuario con `populate` o null.
const idOf = (value) => (value == null ? null : String(value._id ?? value));

/**
 * Lo que se suma a `{ userId: accountId }` en TODA búsqueda de conversaciones
 * de una persona: sus líneas y, para el agente, la asignación. `null` en el
 * `$in` también encuentra las anteriores al campo.
 */
export const conversationScope = (auth) => {
    const scope = conversationLineScope(auth);
    if (!seesOnlyOwnAndUnassigned(auth)) return scope;
    return { ...scope, assignedTo: { $in: [new mongoose.Types.ObjectId(auth.userId), null] } };
};

/** Lo mismo que `conversationScope`, sobre un documento ya leído. */
export const canSeeConversation = (auth, conversation) => {
    if (!inLineScope(auth, conversation.lineId)) return false;
    if (!seesOnlyOwnAndUnassigned(auth)) return true;
    const assignedTo = idOf(conversation.assignedTo);
    return assignedTo === null || assignedTo === auth.userId;
};

/** La `meta` de un evento de una conversación: su línea y quién la atiende. */
export const conversationMeta = (conversation) => ({
    lineId: idOf(conversation.lineId),
    assignedTo: idOf(conversation.assignedTo),
});

/** Las acciones que tiene, en el orden de `PERMISSIONS`: van en la sesión del frontend. */
export const permissionsFor = (auth) => Object.keys(PERMISSIONS).filter(action => can(auth, action));

/**
 * Si una conexión SSE con esta sesión recibe un evento (Fase 3). `meta` lo pone
 * quien emite: `permission`, si hace falta una acción (el progreso de una
 * campaña), y `lineId`, si el evento es de una línea; la clave presente con
 * `null` (una conversación sin línea) cuenta como «de ninguna». Un evento de
 * una conversación lleva además `assignedTo` (Fase 4, `conversationMeta`). Sin
 * `meta`, el evento es de toda la cuenta (un contacto).
 */
export const canReceive = (auth, meta = {}) => {
    if (meta.permission && !can(auth, meta.permission)) return false;
    if ('lineId' in meta && !inLineScope(auth, meta.lineId)) return false;
    if ('assignedTo' in meta && seesOnlyOwnAndUnassigned(auth)) {
        const assignedTo = idOf(meta.assignedTo);
        if (assignedTo !== null && assignedTo !== auth.userId) return false;
    }
    return true;
};

/**
 * Qué le toca a una conexión cuando una conversación cambia de manos (`before`
 * y `after`, sus `conversationMeta`): `conversation_assigned` si la sigue
 * viendo, `conversation_revoked` si la pierde (para quitarla de su caché:
 * filtrar solo por el dueño nuevo no le avisaría; spec § 3.4), o nada.
 */
export const assignmentEventFor = (auth, before, after) => {
    if (canReceive(auth, after)) return 'conversation_assigned';
    if (canReceive(auth, before)) return 'conversation_revoked';
    return null;
};
