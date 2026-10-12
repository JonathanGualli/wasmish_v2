import mongoose from 'mongoose';
import Account from '../models/account.model.js';
import User from '../models/user.model.js';

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
