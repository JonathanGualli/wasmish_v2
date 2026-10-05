// WhatsApp solo permite texto libre dentro de las 24 h siguientes al último
// mensaje DEL CLIENTE. Fuera de esa ventana, solo plantillas aprobadas.
// Este archivo es el único sitio donde vive ese "24": el frontend recibe el
// instante de cierre ya calculado y solo lo compara con su reloj.
export const WINDOW_MS = 24 * 60 * 60 * 1000;

// Instante en que se cierra la ventana, o null si el contacto nunca escribió.
export const getWindowExpiry = (lastInboundAt) => {
    if (!lastInboundAt) return null;

    const inbound = new Date(lastInboundAt);
    if (Number.isNaN(inbound.getTime())) return null;

    return new Date(inbound.getTime() + WINDOW_MS);
};

// Conveniencia para el backend. El frontend NO usa esto: compara el
// windowExpiresAt que recibe con su propio reloj, porque un booleano
// calculado en el servidor caduca en cuanto pasa el tiempo.
export const isWindowOpen = (lastInboundAt, now = new Date()) => {
    const expiry = getWindowExpiry(lastInboundAt);
    return expiry !== null && expiry.getTime() > now.getTime();
};

// Por qué no se puede mandar texto libre, o null si se puede: 'never' si el
// contacto nunca escribió (hay que empezar con una plantilla) y 'closed' si
// escribió hace más de 24 h. Se mira antes de llamar a Meta, que respondería
// 131047 y dejaría un mensaje fallido en el chat.
export const freeTextBlockReason = (lastInboundAt, now = new Date()) => {
    if (isWindowOpen(lastInboundAt, now)) return null;
    return getWindowExpiry(lastInboundAt) ? 'closed' : 'never';
};
