// Dónde y cómo se guardan los adjuntos que llegan por WhatsApp.
//
// El archivo se nombra con el mediaId de Meta, que es numérico y único, así que
// nunca puede contener «..» ni barras: el nombre no lo construye el usuario. Aun
// así se valida antes de tocar el disco, porque de aquí sale una ruta real.
import fs from 'node:fs/promises';
import path from 'node:path';

// Tipos de los que sí bajamos el archivo. El resto (ubicación, contactos,
// botones…) no tiene nada que descargar.
export const TIPOS_CON_ARCHIVO = new Set(['image', 'video', 'audio', 'document', 'sticker']);

// Meta manda el mime con parámetros: "audio/ogg; codecs=opus".
const mimeBase = (mimeType) => String(mimeType ?? '').split(';')[0].trim().toLowerCase();

// Extensión por mime. Solo formatos que WhatsApp admite; lo que no esté en la
// lista se guarda como .bin, que el navegador se descarga en vez de ejecutar.
const EXTENSIONES = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'video/mp4': 'mp4', 'video/3gpp': '3gp',
    'audio/aac': 'aac', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3',
    'audio/amr': 'amr', 'audio/ogg': 'ogg',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};

export const extensionParaMime = (mimeType) => EXTENSIONES[mimeBase(mimeType)] ?? 'bin';

// El mime con el que se sirve. Uno desconocido sale como octet-stream para que
// el navegador lo descargue en lugar de intentar interpretarlo.
export const mimeParaServir = (mimeType) => {
    const base = mimeBase(mimeType);
    return EXTENSIONES[base] ? base : 'application/octet-stream';
};

// Nombre del archivo en disco. Devuelve null si el mediaId no es lo que Meta
// manda siempre (solo dígitos), en vez de arriesgarse a escribir donde no debe.
export const nombreDeArchivo = (mediaId, mimeType) => {
    if (!/^\d{1,64}$/.test(String(mediaId ?? ''))) return null;
    return `${mediaId}.${extensionParaMime(mimeType)}`;
};

// Ruta absoluta dentro del directorio de medios, con una última comprobación de
// que no se ha escapado de él. Cinturón y tirantes: si algún día el nombre deja
// de venir de nombreDeArchivo(), esto sigue sujetando.
export const rutaDeArchivo = (directorio, nombre) => {
    const base = path.resolve(directorio);
    const completa = path.resolve(base, nombre);
    return completa.startsWith(base + path.sep) ? completa : null;
};

export const guardarArchivo = async (directorio, nombre, contenido) => {
    const ruta = rutaDeArchivo(directorio, nombre);
    if (!ruta) throw new Error(`Nombre de archivo inseguro: ${nombre}`);

    await fs.mkdir(path.dirname(ruta), { recursive: true });
    await fs.writeFile(ruta, contenido);
    return ruta;
};
