import type { Message } from "../models/message.mode";

/** Un archivo de los chats traídos de la app que no llegó (backend: `HISTORY_PLACEHOLDER_TEXT`). */
export const HISTORY_PLACEHOLDER_TEXT = 'Archivo: míralo en tu celular';

/**
 * Meta solo manda los archivos de las dos últimas semanas, y solo los del
 * cliente: el resto se guarda como `unsupported` con este texto. Es frecuente
 * (casi 1 de cada 10 mensajes traídos en la prueba con Meta de verdad), así que
 * se pinta tranquilo, no como un error.
 */
export const isHistoryPlaceholder = (msg: Pick<Message, 'type' | 'text'>) =>
    msg.type === 'unsupported' && msg.text === HISTORY_PLACEHOLDER_TEXT;
