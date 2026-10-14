import mongoose from 'mongoose';
import Account from '../models/account.model.js';
import User from '../models/user.model.js';
import { sessionAuthFor } from '../utils/account.js';
import { lineScope, permissionsFor } from '../utils/permissions.js';

// El owner de la cuenta. Hasta la Fase 2 de multi-línea es quien guarda la
// conexión de WhatsApp (token, número y WABA), así que es a quien se busca
// para enviar, sincronizar plantillas o conectar un número.
export const findAccountOwner = (accountId) => User.findOne({ accountId, role: 'owner' });

// El registro: una cuenta nueva y su owner, con el mismo `_id` (ver
// utils/account.js). `password` llega ya hasheada. Sin transacción (el Mongo
// de producción no es un replica set): si el usuario no se puede crear (un
// correo repetido que llegó a la vez), se borra la cuenta y sigue el error.
export const createAccountWithOwner = async ({ name, email, password }) => {
    const _id = new mongoose.Types.ObjectId();
    await Account.create({ _id, name, ownerId: _id });
    try {
        return await User.create({ _id, name, email, password, accountId: _id, role: 'owner' });
    } catch (error) {
        await Account.deleteOne({ _id });
        throw error;
    }
};

const MANAGER_ROLES = ['owner', 'admin'];

/**
 * Lo que la sesión le dice al frontend sobre su acceso (Fase 3): el rol, las
 * acciones que tiene (`permissionsFor`), las líneas a su alcance (`null` =
 * todas) y la cuenta. De la cuenta: cuántas personas activas hay (con una sola,
 * la UI no enseña el rol ni quién respondió) y quiénes la gestionan, solo nombre
 * y rol (a quién pedirle acceso). La autoridad sigue siendo el backend.
 */
export const sessionAccessFor = async (user) => {
    const auth = sessionAuthFor(user);
    if (!auth) return { role: user?.role ?? null, permissions: [], lineIds: [], account: null };

    const [account, members] = await Promise.all([
        Account.findById(auth.accountId).select('name').lean(),
        User.find({ accountId: auth.accountId, status: { $ne: 'inactive' } }).select('name role').sort({ createdAt: 1 }).lean(),
    ]);
    const managers = members
        .filter(member => MANAGER_ROLES.includes(member.role))
        .sort((x, y) => MANAGER_ROLES.indexOf(x.role) - MANAGER_ROLES.indexOf(y.role))
        .map(member => ({ name: member.name, role: member.role }));

    return {
        role: auth.role,
        permissions: permissionsFor(auth),
        lineIds: lineScope(auth),
        account: { name: account?.name ?? null, memberCount: members.length, managers },
    };
};
