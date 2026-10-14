// La cuenta (organización) y quién la usa. La cuenta de un usuario migrado, o
// creada por el registro, tiene el MISMO `_id` que su owner: así el `userId` de
// contactos, conversaciones, etc. pasa a significar «la cuenta» sin migrar
// ningún documento (spec multi-línea, § 3.1, opción B).

// Qué hace `migrate:accounts` con un usuario:
// - `skip`: ya tiene cuenta (la migración es idempotente);
// - `stop`: un `rol: 'agent'` sin cuenta no tiene a qué cuenta pertenecer, y
//   el script para entero en vez de inventarle una;
// - `create`: su cuenta, con su mismo `_id`, y él de owner.
export const planAccountMigration = (user) => {
    if (user.accountId) return { action: 'skip' };

    if (user.rol === 'agent') {
        return { action: 'stop', reason: 'rol agent sin cuenta propia: hay que decidir a qué cuenta pertenece' };
    }

    return {
        action: 'create',
        account: { _id: user._id, name: user.name, ownerId: user._id },
        userUpdate: { accountId: user._id, role: 'owner', isSuperadmin: user.rol === 'superadmin' },
    };
};

// El `req.auth` de una sesión con cookie, o null si ese usuario no puede
// entrar: no existe, está desactivado o aún no tiene cuenta (sin migrar).
export const sessionAuthFor = (user) => {
    if (!user || user.status === 'inactive' || !user.accountId) return null;

    return {
        userId: String(user._id),
        accountId: String(user.accountId),
        // Para firmar lo que envía desde el chat (`Message.sentByName`).
        name: user.name,
        role: user.role,
        lineIds: (user.lineIds ?? []).map(String),
        isSuperadmin: Boolean(user.isSuperadmin),
    };
};
