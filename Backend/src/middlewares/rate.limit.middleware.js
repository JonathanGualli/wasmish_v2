import rateLimit from 'express-rate-limit';

// Login/registro: por IP. Solo cuenta los intentos FALLIDOS.
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: [{ message: 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.' }],
});

// API pública, primera capa: por IP, ANTES de validar la key.
export const publicApiIpLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: [{ message: 'Límite de peticiones excedido. Inténtalo en un minuto.' }],
});

// API pública, segunda capa: por usuario dueño de la key.
export const publicApiUserLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    keyGenerator: (req) => req.user.id,
    standardHeaders: true,
    legacyHeaders: false,
    message: [{ message: 'Límite de envíos excedido. Inténtalo en un minuto.' }],
});
