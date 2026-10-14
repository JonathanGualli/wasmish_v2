import { can } from "../utils/permissions.js";

// Una acción que el rol de la sesión no tiene (`utils/permissions.js`): 403. Es
// su propia cuenta, no hay nada que ocultar; lo de una línea fuera de su
// alcance, en cambio, responde 404 en cada controlador (regla 1). Va detrás de
// `authRequired`.
export const FORBIDDEN_MESSAGE = 'Tu rol no permite esta acción.';

export const requirePermission = (action) => (req, res, next) => {
    if (!can(req.auth, action)) return res.status(403).json([{ message: FORBIDDEN_MESSAGE, code: 'forbidden' }]);
    next();
};
