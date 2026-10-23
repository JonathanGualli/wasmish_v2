// Las cuentas de demostración, una por nicho (imprenta y capacitación), con
// datos inventados: para enseñar Wasmish a un prospecto sin datos reales. Ver
// services/demo.service.js y scripts/fixtures/demo.scenarios.js.
//
//   DEMO_PASSWORD=… node scripts/seed-demo.js            ← crea las dos
//   DEMO_PASSWORD=… node scripts/seed-demo.js --reset    ← las rehace (antes de cada demo)
//   node scripts/seed-demo.js --clean                    ← las borra
//   … --only imprenta | --only capacitacion              ← solo una
//
// Se corre en PRODUCCIÓN, dentro del contenedor de la api (pruebas-y-scripts.md
// § Cuentas de demostración). Solo toca una cuenta con la marca de
// demostración: si el correo de un escenario es de otra cuenta, para sin escribir.
import 'dotenv/config';
import path from 'node:path';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import { MEDIA_DIR } from '../src/config.js';
import { cleanDemoAccount, seedDemoAccount } from '../src/services/demo.service.js';
import { DEMO_SCENARIOS } from './fixtures/demo.scenarios.js';

const args = process.argv.slice(2);
const option = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] ?? null : null;
};
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/wasmish';
const safeUri = MONGO_URI.replace(/\/\/[^/]*@/, '//***:***@');
const FIXTURES_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures');

const fail = (message) => { console.error(message); process.exit(1); };

const main = async () => {
    const only = option('only');
    if (only && !DEMO_SCENARIOS[only]) fail(`--only: ${Object.keys(DEMO_SCENARIOS).join(' o ')}`);
    const scenarios = only ? [DEMO_SCENARIOS[only]] : Object.values(DEMO_SCENARIOS);
    const clean = args.includes('--clean');
    const password = process.env.DEMO_PASSWORD ?? '';
    if (!clean && password.length < 10) fail('Falta DEMO_PASSWORD (10 caracteres o más): la contraseña de las cuentas de demostración.');

    await mongoose.connect(MONGO_URI);
    console.log(`Conectado a ${safeUri}\n`);
    for (const scenario of scenarios) {
        if (clean) {
            const deleted = await cleanDemoAccount(scenario, { mediaDir: MEDIA_DIR });
            console.log(`${scenario.accountName}: ${deleted ? 'borrada' : 'no existía'}`);
            continue;
        }
        const { action, counts } = await seedDemoAccount(scenario, {
            passwordHash: await bcrypt.hash(password, 10), reset: args.includes('--reset'),
            mediaDir: MEDIA_DIR, fixturesDir: FIXTURES_DIR,
        });
        console.log(`${scenario.accountName}: ${action === 'reset' ? 'rehecha' : 'creada'}`);
        console.log(`  Dueño: ${scenario.owner.email} · Agente: ${scenario.agent.email}`);
        console.log(`  ${counts.contacts} contactos · ${counts.conversations} conversaciones · ${counts.messages} mensajes · campaña a ${counts.campaignRecipients}\n`);
    }
    await mongoose.disconnect();
};

main().catch(async (error) => {
    console.error('No se pudo:', error.message);
    await mongoose.disconnect();
    process.exit(1);
});
