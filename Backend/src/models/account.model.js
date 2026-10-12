import mongoose from 'mongoose';

// La cuenta (organización): de ella cuelgan los datos de un cliente. Su `_id`
// es el mismo que el de su primer owner, y por eso el campo `userId` de los
// demás modelos guarda la cuenta (ver utils/account.js).
const accountSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    // Nombre del plan comercial, solo informativo: lo que limita son `limits`,
    // que el superadmin ajusta a mano mientras el cobro va fuera de Wasmish.
    plan: {
        type: String,
        default: null,
    },
    limits: {
        maxLines: { type: Number, default: 1 },
        maxUsers: { type: Number, default: 1 },
    },
    // La línea por defecto: la que usan la API pública sin `lineId` y los
    // envíos sin línea, y la que se copia en `User` para la imagen anterior.
    defaultLineId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Line',
        default: null,
    },
    // El candado de los cambios de líneas (conectar, desconectar, la por
    // defecto): uno a la vez por cuenta, también entre procesos. Caduca solo
    // por si un proceso muere con él (ver `withLineLock`).
    lineLock: {
        type: new mongoose.Schema({ token: String, expiresAt: Date }, { _id: false }),
        default: null,
    },
    // La copia de la conexión en `User` no se pudo escribir: `migrate:lines`
    // la repara desde `Line`, que es la fuente (ver `writeLegacyUser`).
    legacyUserStale: {
        type: Boolean,
        default: false,
    },
}, {
    timestamps: true,
});

export default mongoose.model('Account', accountSchema);
