import crypto from 'crypto';
import { TOKEN_SECRET } from '../config.js';

const algorithm = 'aes-256-cbc';
const key = crypto.createHash("sha256").update(String(TOKEN_SECRET)).digest("base64").substring(0, 32);
const iv = crypto.randomBytes(16);

export const encrypt = (text) => {
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
};

export const decrypt = (hash) => {
    const parts = hash.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = parts.join(':');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}