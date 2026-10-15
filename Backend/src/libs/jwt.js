import { TOKEN_SECRET } from "../config.js";
import jwt from "jsonwebtoken";
import { SESSION_DAYS } from "../utils/session.js";

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