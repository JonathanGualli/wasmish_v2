// ---------------------------------------------------------------------------
// Cuánto dura la sesión de la web y de la app (decisión del 2026-10-15): 30
// días desde la última vez que se abre, como una app de mensajería. Se
// renueva al abrir (`GET /verify`), como mucho una vez al día.
// ---------------------------------------------------------------------------

export const SESSION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_MAX_AGE_MS = SESSION_DAYS * DAY_MS;

/**
 * Las opciones de la cookie `token`. Con `maxAge`: sin él la cookie es «de
 * sesión» y el navegador la borra al cerrarse, que en la app instalada del
 * teléfono pasa cada vez que el sistema la cierra.
 */
export const sessionCookieOptions = (isProd) => ({
    httpOnly: true,
    secure: isProd,                     // en prod la web es HTTPS
    sameSite: isProd ? 'none' : 'lax',  // en prod el front y la api no comparten origen; en dev, http
    maxAge: SESSION_MAX_AGE_MS,
});

/**
 * Si hay que emitir un token nuevo: cuando al de ahora le queda menos de 29
 * días, o sea, tiene más de un día. Mira lo que le QUEDA (`exp`, en segundos),
 * no su edad: un token de antes de esta regla (de 24 h) tiene que renovarse
 * aunque sea de hace una hora, o caduca igual.
 */
export const shouldRenewSession = (expSeconds, now = Date.now()) => {
    if (!Number.isFinite(expSeconds)) return true;
    return expSeconds * 1000 - now < SESSION_MAX_AGE_MS - DAY_MS;
};
