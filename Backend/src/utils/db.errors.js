// Distingue una caída de la BD de un mensaje roto. El webhook procesa cada
// mensaje en su propio try/catch: uno roto (un dato raro, un bug) se descarta
// con 200, porque reentregarlo fallaría igual durante los 7 días que Meta
// reintenta. Pero si lo que falló es Mongo, el mismo mensaje se guardaría
// minutos después: ahí hay que responder 500 para que Meta lo reentregue.

// Sin red con Mongo, sin servidor disponible o con la conexión cerrada.
const TRANSIENT_NAMES = new Set([
    'MongoNetworkError',
    'MongoNetworkTimeoutError',
    'MongoServerSelectionError',
    'MongooseServerSelectionError',
    'MongoNotConnectedError',
    'MongoTopologyClosedError',
    'MongoServerClosedError',
    'MongoPoolClearedError',
]);

// Las etiquetas con las que el driver marca lo que se puede repetir.
const TRANSIENT_LABELS = ['RetryableWriteError', 'TransientTransactionError', 'ResetPool'];

// Los códigos de servidor que el driver considera reintentables
// (`RETRYABLE_READ_ERROR_CODES` de `mongodb/lib/error.js`): el primario cambió,
// se está apagando o no se llegó a tiempo.
const TRANSIENT_CODES = new Set([6, 7, 89, 91, 134, 189, 262, 9001, 10107, 11600, 11602, 13435, 13436]);

// Mongoose guarda las operaciones mientras no hay conexión y, si no vuelve a
// tiempo (10 s), las rechaza con un `MongooseError` que solo se reconoce por el texto.
const BUFFERING_TIMEOUT = /buffering timed out/;

/**
 * @returns {boolean} si el error es de Mongo no disponible: repetir la misma
 *          operación más tarde puede salir bien.
 */
export const isTransientDbError = (error) => {
    if (!error) return false;
    if (TRANSIENT_NAMES.has(error.name)) return true;
    if (Array.isArray(error.errorLabels) && error.errorLabels.some((label) => TRANSIENT_LABELS.includes(label))) return true;
    if (typeof error.code === 'number' && TRANSIENT_CODES.has(error.code)) return true;
    return error.name === 'MongooseError' && BUFFERING_TIMEOUT.test(error.message ?? '');
};
