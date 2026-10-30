// Pasa la nota de antes de cada contacto (`Contact.notes`) a su lista de notas,
// sin autor y con la fecha del contacto (notas del contacto con autor,
// 2026-10-17): ver services/note.migration.service.js.
//
//   node scripts/migrate-notes.js --dry-run   ← solo informa, no escribe
//   node scripts/migrate-notes.js --check     ← igual, y sale con 1 si queda alguna
//   node scripts/migrate-notes.js             ← aplica los cambios
//   node scripts/migrate-notes.js --drop-text ← aplica y después borra `Contact.notes`
//                                               (con --dry-run, solo cuenta)
//
// Idempotente. Sin `--drop-text` no borra `Contact.notes`; con él, solo donde
// ya no se pierde nada (texto vacío o ya pasado a la lista): ver
// `runNoteTextDrop`. Borrar no tiene vuelta atrás: antes, `mongodump`.
import 'dotenv/config';
import mongoose from 'mongoose';

import ContactNote from '../src/models/contact.note.model.js';
import { runNoteMigration, runNoteTextDrop } from '../src/services/note.migration.service.js';

const dryRun = process.argv.includes('--dry-run');
const check = process.argv.includes('--check');
const dropText = process.argv.includes('--drop-text');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/wasmish';

// Misma precaución que backfill-last-inbound.js: la URI lleva la contraseña.
const safeUri = MONGO_URI.replace(/\/\/[^/]*@/, '//***:***@');

const main = async () => {
    // Sin `autoIndex` ni `autoCreate`, como migrate-lines.js: con --check y
    // --dry-run no se escribe nada. Al aplicar, el índice único de la nota de
    // antes se crea a mano antes de escribir: es el que impide duplicarla.
    await mongoose.connect(MONGO_URI, { autoIndex: false, autoCreate: false });
    console.log(`Conectado a ${safeUri}`);
    const readOnly = dryRun || check;
    if (readOnly) console.log('Solo informa: no se va a escribir nada\n');
    else await ContactNote.createIndexes();

    const { pending, migrated } = await runNoteMigration({ dryRun: readOnly });
    console.log(`Contactos con una nota de antes por pasar a la lista: ${pending}`);
    if (!readOnly) {
        console.log(`Notas creadas: ${migrated}`);
        const after = await runNoteMigration({ dryRun: true });
        console.log(`Comprobación: quedan ${after.pending}`);
    }

    if (dropText) {
        const { dropped, kept } = await runNoteTextDrop({ dryRun: readOnly });
        console.log(`${readOnly ? 'Contactos a los que se les borraría' : 'Contactos a los que se les borró'} el texto de antes: ${dropped}`);
        if (kept > 0) console.log(`Se quedan con el texto, porque no tienen su nota en la lista: ${kept}`);
    }

    await mongoose.disconnect();
    if (check && pending > 0) process.exit(1);
};

main().catch(async (error) => {
    console.error('Error en la migración:', error);
    await mongoose.disconnect();
    process.exit(1);
});
