import jwt from "jsonwebtoken";
import { TOKEN_SECRET } from "../config.js";
import User from "../models/user.model.js";
import { sessionAuthFor } from "../utils/account.js";
import { setSessionCookie } from "../libs/jwt.js";
import { shouldRenewSession } from "../utils/session.js";

// La sesión con cookie. El usuario se lee de la BD en CADA petición, no del
// JWT, para que desactivarlo o quitarle acceso tenga efecto inmediato sin
// esperar a que caduque la cookie. Deja `req.auth` (ver `sessionAuthFor`): el
// dueño de los datos es `req.auth.accountId`, nunca la persona de la sesión.
export const authRequired = async (req, res, next) => {
    const { token } = req.cookies;
    if(!token)  return res.status(401).json(['No token, authorization denied']);

    let payload;
    try {
        payload = jwt.verify(token, TOKEN_SECRET);
    } catch {
        return res.status(403).json(['Token is not valid']);
    }

    try {
        const user = await User.findById(payload.id).select('name accountId role lineIds isSuperadmin status').lean();
        const auth = sessionAuthFor(user);
        if (!auth) return res.status(401).json([{ message: 'Unauthorized' }]);

        // Usar la app alarga la sesión, no solo abrirla: con la pestaña o la app
        // suspendida y sin recargar, `/verify` no se vuelve a llamar (revisión
        // de Codex del PR #58). Como mucho un token nuevo al día.
        if (shouldRenewSession(payload.exp)) await setSessionCookie(res, user._id);

        req.auth = auth;
        next();
    } catch (error) {
        return res.status(500).json([{ message: error.message }]);
    }
}
