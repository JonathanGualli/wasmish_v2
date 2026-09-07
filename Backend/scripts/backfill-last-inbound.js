// Rellena Conversation.lastInboundAt en las conversaciones creadas antes de que
// el campo existiera, tomando el timestamp del último mensaje entrante de cada una.
//
//   node scripts/backfill-last-inbound.js --dry-run   ← solo informa, no escribe
//   node scripts/backfill-last-inbound.js             ← aplica los cambios
//
// Idempotente: correrlo dos veces deja exactamente el mismo resultado.
import 'dotenv/config';
import mongoose from 'mongoose';

import Conversation from '../src/models/conversation.model.js';
import Message from '../src/models/message.model.js';

const dryRun = process.argv.includes('--dry-run');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/wasmish';

const main = async () => {
    await mongoose.connect(MONGO_URI);
    console.log(`Conectado a ${MONGO_URI}`);
    if (dryRun) console.log('MODO --dry-run: no se va a escribir nada\n');

    // Último mensaje entrante de cada conversación, en una sola pasada.
    const ultimos = await Message.aggregate([
        { $match: { direction: 'inbound' } },
        { $group: { _id: '$conversationId', lastInboundAt: { $max: '$timestamp' } } },
    ]);

    const totalConversaciones = await Conversation.countDocuments({});

    // Solo escribimos si el valor falta o es más viejo: así el script nunca pisa
    // lo que el webhook ya haya puesto mientras tanto.
    const operaciones = ultimos.map(({ _id, lastInboundAt }) => ({
        updateOne: {
            filter: {
                _id,
                $or: [
                    { lastInboundAt: null },
                    { lastInboundAt: { $exists: false } },
                    { lastInboundAt: { $lt: lastInboundAt } },
                ],
            },
            update: { $set: { lastInboundAt } },
        },
    }));

    console.log(`Conversaciones en total:            ${totalConversaciones}`);
    console.log(`Con al menos un mensaje entrante:   ${ultimos.length}`);
    console.log(`Sin ningún entrante (quedan null):  ${totalConversaciones - ultimos.length}`);

    if (dryRun) {
        console.log(`\nSe actualizarían hasta ${operaciones.length} conversaciones.`);
    } else if (operaciones.length > 0) {
        // timestamps: false → no ensuciamos updatedAt por una migración
        const resultado = await Conversation.bulkWrite(operaciones, { timestamps: false });
        console.log(`\nActualizadas: ${resultado.modifiedCount}`);
    } else {
        console.log('\nNada que actualizar.');
    }

    await mongoose.disconnect();
};

main().catch(async (error) => {
    console.error('Error en el backfill:', error);
    await mongoose.disconnect();
    process.exit(1);
});
