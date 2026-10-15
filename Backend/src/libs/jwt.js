import { TOKEN_SECRET } from "../config.js";
import jwt from "jsonwebtoken";
import { SESSION_DAYS, sessionCookieOptions } from "../utils/session.js";

export function createAccessToken(payload) {
    return new Promise((resolve, reject) => {
        jwt.sign(
            payload, 
            TOKEN_SECRET,
            {
                expiresIn: `${SESSION_DAYS}d`
            }, (err, token) => {
                if(err) reject(err);
                // res.json({ token });  
                resolve(token);
            }
        );
    });
}

/**
 * Abre o renueva la sesión en el navegador: un token nuevo de 30 días en la
 * cookie `token`. La usan el login y el registro, `/verify` y `authRequired`.
 */
export const setSessionCookie = async (res, userId) => {
    const token = await createAccessToken({ id: userId });
    res.cookie('token', token, sessionCookieOptions(process.env.NODE_ENV === 'production'));
};
