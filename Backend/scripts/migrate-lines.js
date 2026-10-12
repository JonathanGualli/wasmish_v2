// Crea las líneas (`Waba` + `Line`) de los datos de hoy y le pone a cada
// conversación la línea de SU número, a cada campaña la línea por defecto de su
// cuenta, y cambia el índice de conversaciones a uno por contacto y línea
// (Fase 2b). Fase 2a de multi-línea: ver services/line.migration.service.js.
//
//   node scripts/migrate-lines.js --dry-run   ← solo informa, no escribe
//   node scripts/migrate-lines.js --check     ← igual, y sale con 1 si queda algo
//   node scripts/migrate-lines.js             ← aplica los cambios
//
// Idempotente, y se puede correr con la API en marcha: la conexión actual se
// lee de `User` en el momento de escribir. Para sin escribir nada si un WABA
// está en dos cuentas o una conversación no tiene número.
import 'dotenv/config';
import mongoose from 'mongoose';

import Line from '../src/models/line.model.js';
import Waba from '../src/models/waba.model.js';
import { runLineMigration } from '../src/services/line.migration.service.js';

const dryRun = process.argv.includes('--dry-run');
const check = process.argv.includes('--check');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/wasmish';

// Misma precaución que backfill-last-inbound.js: la URI lleva la contraseña.
const safeUri = MONGO_URI.replace(/\/\/[^/]*@/, '//***:***@');

const printPending = ({ pending, issues }) => {
    console.log(`Líneas anteriores por crear: ${pending.oldLines} · conversaciones sin línea: ${pending.conversations} · campañas sin línea: ${pending.campaigns}`);
    console.log(`Cuentas con WABA o líneas desajustados respecto a User: ${pending.accountsOutOfSync}`);
    console.log(`Índice viejo de conversaciones (uno por contacto, sin línea): ${pending.oldConversationIndex ? 'sigue, se cambia' : 'ya no está'}`);
    issues.forEach(({ account, issues }) => console.log(`  ${account}: ${issues.join('; ')}`));
};

const main = async () => {
    // Sin `autoIndex` ni `autoCreate`: Mongoose crearía los índices de los
    // modelos al cargarlos, también con --check y --dry-run, que no escriben.
    // Al aplicar se crean a mano, antes de escribir nada.
    await mongoose.connect(MONGO_URI, { autoIndex: false, autoCreate: false });
    console.log(`Conectado a ${safeUri}`);
    if (dryRun || check) console.log('Solo informa: no se va a escribir nada\n');

    // Los índices únicos de Waba y Line tienen que existir ANTES de escribir:
    // son los que frenan un WABA o un número activo en dos cuentas.
    if (!dryRun && !check) await Promise.all([Waba.createIndexes(), Line.createIndexes()]);

    const result = await runLineMigration({ dryRun, check });

    if (result.stop.length > 0) {
        console.error(`La migración no se puede hacer sola. No se escribió nada:`);
        result.stop.forEach(({ account, reason }) => console.error(`  ${account}: ${reason}`));
        await mongoose.disconnect();
        process.exit(1);
    }

    printPending(result);

    if (result.applied) {
        console.log('\nAplicado. Comprobación:');
        const after = await runLineMigration({ check: true });
        printPending(after);
    }

    await mongoose.disconnect();

    if (check) {
        const { pending } = result;
        const left = pending.oldLines + pending.conversations + pending.campaigns + pending.accountsOutOfSync
            + (pending.oldConversationIndex ? 1 : 0);
        if (left > 0) process.exit(1);
    }
};

main().catch(async (error) => {
    console.error('Error en la migración:', error);
    await mongoose.disconnect();
    process.exit(1);
});
