// Crea un Contact por cada conversación anterior a los contactos y la enlaza
// (Conversation.contactId). El nombre que tenía la conversación pasa al contacto.
// Al final borra el índice único viejo { userId, contactPhone }, que ya no sirve:
// un contacto puede no tener teléfono, y dos conversaciones sin él chocarían.
//
//   node scripts/backfill-contacts.js --dry-run   ← solo informa, no escribe
//   node scripts/backfill-contacts.js             ← aplica los cambios
//
// Idempotente: solo toca las conversaciones sin contactId, y la app enlaza sola
// las que toque antes de que esto corra, así que da igual correrlo antes o
// después de desplegar.
import 'dotenv/config';
import mongoose from 'mongoose';

import Contact from '../src/models/contact.model.js';
import Conversation from '../src/models/conversation.model.js';
import { getConversationContact } from '../src/controllers/contact.controller.js';

const LEGACY_INDEX = 'userId_1_contactPhone_1';

const dryRun = process.argv.includes('--dry-run');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/wasmish';

// Misma precaución que backfill-last-inbound.js: la URI lleva la contraseña.
const safeUri = MONGO_URI.replace(/\/\/[^/]*@/, '//***:***@');

const main = async () => {
    await mongoose.connect(MONGO_URI);
    console.log(`Conectado a ${safeUri}`);
    if (dryRun) console.log('MODO --dry-run: no se va a escribir nada\n');

    // Los índices únicos de Contact tienen que existir ANTES de crear contactos:
    // son los que impiden duplicarlos si el webhook crea el mismo a la vez.
    if (!dryRun) await Contact.init();

    const pending = await Conversation.find({ contactId: null });
    console.log(`Conversaciones sin contacto: ${pending.length}`);

    let linked = 0;
    const failed = [];
    for (const conversation of pending) {
        if (dryRun) continue;
        try {
            await getConversationContact(conversation);
            linked++;
        } catch (error) {
            failed.push({ id: String(conversation._id), error: error.message });
        }
    }

    const indexes = await Conversation.collection.indexes();
    const hasLegacyIndex = indexes.some(index => index.name === LEGACY_INDEX);

    if (dryRun) {
        console.log(`\nSe crearían o enlazarían ${pending.length} contactos.`);
        console.log(hasLegacyIndex ? `Se borraría el índice ${LEGACY_INDEX}.` : `El índice ${LEGACY_INDEX} ya no existe.`);
        await mongoose.disconnect();
        return;
    }

    console.log(`Enlazadas: ${linked}`);
    if (failed.length > 0) {
        // No se borra el índice viejo con conversaciones sin enlazar: sin contactId,
        // el nuevo índice no las cubre y el viejo es lo único que las protege.
        console.error(`\nFallaron ${failed.length}; el índice ${LEGACY_INDEX} se conserva. Corrige y vuelve a correrlo:`);
        failed.forEach(f => console.error(`  ${f.id}: ${f.error}`));
        await mongoose.disconnect();
        process.exit(1);
    }

    if (hasLegacyIndex) {
        await Conversation.collection.dropIndex(LEGACY_INDEX);
        console.log(`Borrado el índice ${LEGACY_INDEX}.`);
    }
    await Conversation.createIndexes();
    console.log('Índices de Conversation al día.');

    await mongoose.disconnect();
};

main().catch(async (error) => {
    console.error('Error en el backfill:', error);
    await mongoose.disconnect();
    process.exit(1);
});
