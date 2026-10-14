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
 * Lo que se suma a `{ userId: accountId }` en TODA búsqueda de conversaciones
 * de una persona. La Fase 4 añadirá aquí la asignación del agente.
 */
export const conversationScope = (auth) => {
    const scope = lineScope(auth);
    if (scope === null) return {};
    return { lineId: { $in: scope.map(id => new mongoose.Types.ObjectId(id)) } };
};

/** Las acciones que tiene, en el orden de `PERMISSIONS`: van en la sesión del frontend. */
export const permissionsFor = (auth) => Object.keys(PERMISSIONS).filter(action => can(auth, action));
