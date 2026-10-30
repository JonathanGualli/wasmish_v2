/**
 * Llama a Meta (`send`, la función que envía: texto, archivo o plantilla) y
 * devuelve el estado con el que se guarda el mensaje. Nunca lanza: si Meta lo
 * rechaza (o la llamada falla antes, p. ej. al subir un archivo), el mensaje se
 * guarda igual como `failed`, con el código y el detalle de Meta, para que se
 * vea qué no salió y por qué.
 *
 * Un fallo sin `waErrorCode` (un timeout, un corte) también es `failed` con
 * `errorCode: null`: las respuestas automáticas lo distinguen así de un
 * rechazo (`autoReplyOutcome`).
 */
export const metaSendOutcome = async (send) => {
    try {
        const apiRes = await send();
        return { waMessageId: apiRes?.data?.messages?.[0]?.id || null, status: 'sent', errorCode: null, errorDetail: null };
    } catch (error) {
        return {
            waMessageId: null,
            status: 'failed',
            errorCode: error.waErrorCode ? String(error.waErrorCode) : null,
            errorDetail: error.waErrorDetail || error.message,
        };
    }
};
