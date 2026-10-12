// Crea la cuenta (Account) de cada usuario que aún no la tiene, con su mismo
// `_id`, y lo deja de owner (`accountId`, `role`, `isSuperadmin` desde `rol`).
// Fase 1 de multi-línea: ver docs/superpowers/specs/2026-10-11-multi-linea-multi-agente-design.md.
//
//   node scripts/migrate-accounts.js --dry-run   ← solo informa, no escribe
//   node scripts/migrate-accounts.js             ← aplica los cambios
//
// Idempotente: los usuarios con `accountId` no se tocan, y si una pasada se
// corta entre crear la cuenta y actualizar al usuario, la siguiente termina.
// Un usuario `rol: 'agent'` sin cuenta hace parar el script sin escribir nada:
// no hay forma de saber a qué cuenta pertenece.
//
// En producción corre ANTES de arrancar la imagen nueva, que rechaza (401) a
// los usuarios sin cuenta; la pasada final, con la API vieja parada.
import 'dotenv/config';
import mongoose from 'mongoose';

import Account from '../src/models/account.model.js';
import User from '../src/models/user.model.js';
import { planAccountMigration } from '../src/utils/account.js';

const dryRun = process.argv.includes('--dry-run');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/wasmish';

// Misma precaución que backfill-last-inbound.js: la URI lleva la contraseña.
const safeUri = MONGO_URI.replace(/\/\/[^/]*@/, '//***:***@');

const main = async () => {
    await mongoose.connect(MONGO_URI);
    console.log(`Conectado a ${safeUri}`);
    if (dryRun) console.log('MODO --dry-run: no se va a escribir nada\n');

    const users = await User.find({}).select('_id name email rol accountId').lean();
    const plans = users.map(user => ({ user, plan: planAccountMigration(user) }));

    const stopped = plans.filter(({ plan }) => plan.action === 'stop');
    if (stopped.length > 0) {
        console.error(`Hay ${stopped.length} usuarios que no se pueden migrar solos. No se escribió nada:`);
        stopped.forEach(({ user, plan }) => console.error(`  ${user.email}: ${plan.reason}`));
        await mongoose.disconnect();
        process.exit(1);
    }

    const toCreate = plans.filter(({ plan }) => plan.action === 'create');
    console.log(`Cuentas a crear: ${toCreate.length} · ya migrados: ${plans.length - toCreate.length}`);

    if (dryRun) {
        await mongoose.disconnect();
        return;
    }

    let accounts = 0;
    let updated = 0;
    for (const { plan } of toCreate) {
        const { account, userUpdate } = plan;
        // $setOnInsert: si la cuenta ya existe (una pasada cortada), no se toca.
        const created = await Account.updateOne({ _id: account._id }, { $setOnInsert: account }, { upsert: true });
        accounts += created.upsertedCount;
        const result = await User.updateOne({ _id: account._id, accountId: { $exists: false } }, { $set: userUpdate });
        updated += result.modifiedCount;
    }

    console.log(`Cuentas creadas: ${accounts} · usuarios actualizados: ${updated}`);
    await mongoose.disconnect();
};

main().catch(async (error) => {
    console.error('Error en la migración:', error);
    await mongoose.disconnect();
    process.exit(1);
});
