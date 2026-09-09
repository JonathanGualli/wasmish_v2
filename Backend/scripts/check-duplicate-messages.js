// Busca mensajes que compartan waMessageId, y opcionalmente los limpia.
//
//   node scripts/check-duplicate-messages.js         ← solo informa, no escribe
//   node scripts/check-duplicate-messages.js --fix   ← borra las copias sobrantes
//
// POR QUÉ EXISTE: Message.waMessageId pasó a tener un índice único parcial. Si
// la base ya trae duplicados de antes, Mongo NO puede crear ese índice y falla
// con E11000. Mongoose lo registra por consola y la app arranca igual — sin el
// índice y sin protección contra duplicados, que es justo lo que se quería
// arreglar. Por eso hay que correr esto ANTES de desplegar, y con --fix si sale
// algo, o el arreglo no llega a aplicarse.
//
// Al limpiar conserva SIEMPRE el documento más antiguo (el original) y borra las
// copias posteriores, que son las que creó el reintento de Meta. Idempotente:
// correrlo dos veces deja el mismo resultado.
import 'dotenv/config';
import mongoose from 'mongoose';

import Message from '../src/models/message.model.js';

const aplicar = process.argv.includes('--fix');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/wasmish';

// Misma protección que backfill-last-inbound: en producción la URI lleva la
// contraseña, y lo que se imprima aquí queda en los logs de quien lo ejecute.
const uriSegura = MONGO_URI.replace(/\/\/[^/]*@/, '//***:***@');

const main = async () => {
    await mongoose.connect(MONGO_URI);
    console.log(`Conectado a ${uriSegura}`);
    if (!aplicar) console.log('MODO INFORME: no se va a borrar nada (usa --fix para aplicar)\n');

    // Solo los que tienen waMessageId de tipo string: los null (envíos que Meta
    // rechazó) quedan fuera del índice único, así que tampoco lo bloquean.
    const grupos = await Message.aggregate([
        { $match: { waMessageId: { $type: 'string' } } },
        { $group: { _id: '$waMessageId', ids: { $push: '$_id' }, total: { $sum: 1 } } },
        { $match: { total: { $gt: 1 } } },
        { $sort: { total: -1 } },
    ]);

    const totalMensajes = await Message.countDocuments({});
    const sobrantes = grupos.reduce((suma, g) => suma + g.total - 1, 0);

    console.log(`Mensajes en total:              ${totalMensajes}`);
    console.log(`waMessageId duplicados:         ${grupos.length}`);
    console.log(`Documentos sobrantes a borrar:  ${sobrantes}`);

    if (grupos.length === 0) {
        console.log('\nSin duplicados: el índice único se puede crear sin problema.');
        await mongoose.disconnect();
        return;
    }

    // Una muestra para poder mirar en la UI qué se va a borrar antes de hacerlo.
    console.log('\nMuestra (hasta 10):');
    for (const g of grupos.slice(0, 10)) {
        console.log(`  ${g._id} → ${g.total} copias`);
    }

    if (!aplicar) {
        console.log('\nVuelve a ejecutarlo con --fix para borrar las copias sobrantes.');
        await mongoose.disconnect();
        return;
    }

    // ObjectId es monótono en el tiempo, así que el menor es el que se creó
    // primero: ese es el original y se queda.
    const aBorrar = grupos.flatMap((g) => {
        const ordenados = [...g.ids].sort((a, b) => (a.getTimestamp() - b.getTimestamp()) || String(a).localeCompare(String(b)));
        return ordenados.slice(1);
    });

    const resultado = await Message.deleteMany({ _id: { $in: aBorrar } });
    console.log(`\nBorrados: ${resultado.deletedCount} documentos sobrantes.`);
    console.log('Ahora sí se puede crear el índice único.');

    await mongoose.disconnect();
};

main().catch(async (error) => {
    console.error('Error comprobando duplicados:', error);
    await mongoose.disconnect();
    process.exit(1);
});
