import { readFileSync } from 'node:fs';

// Versión de la app, leída del propio package.json al arrancar. Es la fuente
// única del backend: no hay que repetirla en ningún otro sitio. Se expone en
// GET /api/version, que además sirve para comprobar qué código está desplegado.
export const APP_VERSION = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
).version;

export const TOKEN_SECRET = process.env.TOKEN_SECRET;
export const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

// Meta / WhatsApp Embedded Signup
export const META_APP_ID = process.env.META_APP_ID;
export const META_APP_SECRET = process.env.META_APP_SECRET;
export const META_CONFIG_ID = process.env.META_CONFIG_ID;
export const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v26.0';

// Adjuntos de WhatsApp descargados. En Docker es un volumen montado en /app/media;
// en local, la carpeta media/ del Backend (que está en .gitignore).
export const MEDIA_DIR = process.env.MEDIA_DIR || 'media';

// Tope por archivo. WhatsApp admite hasta 16 MB en imagen/audio/vídeo y 100 MB
// en documentos; bajamos de ahí para que un documento enorme no llene el disco.
// Si se supera, el mensaje se guarda igual con su etiqueta, solo sin archivo.
export const MEDIA_MAX_BYTES = Number(process.env.MEDIA_MAX_BYTES || 25 * 1024 * 1024);
