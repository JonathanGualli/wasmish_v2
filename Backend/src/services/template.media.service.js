import fs from 'node:fs/promises';
import TemplateMedia from '../models/template.media.model.js';
import { MEDIA_DIR } from '../config.js';
import { uploadMedia } from '../libs/whatsapp.js';
import { rutaDeArchivo, saveByContentHash } from '../utils/media.storage.js';
import { isMetaMediaFresh } from '../utils/template.header.js';

// El nombre original llega en una cabecera HTTP, escrito por quien sube el
// archivo: sin rutas, sin caracteres de control y con un largo razonable.
export const cleanFilename = (raw) => {
    let name = '';
    try {
        name = decodeURIComponent(String(raw ?? ''));
    } catch {
        name = String(raw ?? '');
    }
    name = name.split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f"]/g, '').trim();
    return name.slice(-120) || null;
};

/**
 * Guarda el archivo de la cabecera en disco y crea su `TemplateMedia`. El
 * nombre en disco es el hash del contenido: subir dos veces la misma imagen no
 * la duplica, y nunca lo construye quien sube el archivo.
 */
export const saveHeaderMedia = async ({ userId, buffer, mimeType, filename }) => {
    const file = await saveByContentHash(MEDIA_DIR, 'templates', buffer, mimeType);
    return TemplateMedia.create({ userId, file, mimeType, filename, size: buffer.length });
};

/**
 * El id del archivo en Meta para enviarlo. Si el que hay caducó o es de otro
 * número, se vuelve a subir desde el disco y se guarda el nuevo. Un fallo
 * (token caducado, archivo borrado) sube como error, con el código de Meta si
 * lo hay: quien envía lo registra como cualquier rechazo.
 */
export const ensureMetaMediaId = async (media, { token, phoneNumberId }) => {
    if (isMetaMediaFresh(media, phoneNumberId)) return media.metaMediaId;

    const ruta = rutaDeArchivo(MEDIA_DIR, media.file);
    const buffer = ruta ? await fs.readFile(ruta).catch(() => null) : null;
    if (!buffer) {
        throw new Error('El archivo de la cabecera ya no está en el servidor. Vuelve a subirlo en Plantillas.');
    }

    const metaMediaId = await uploadMedia({
        token, phoneNumberId, buffer, mimeType: media.mimeType, filename: media.filename,
    });
    const metaUploadedAt = new Date();
    await TemplateMedia.updateOne(
        { _id: media._id },
        { $set: { metaMediaId, metaPhoneNumberId: phoneNumberId, metaUploadedAt } },
    );
    Object.assign(media, { metaMediaId, metaPhoneNumberId: phoneNumberId, metaUploadedAt });
    return metaMediaId;
};

/** ¿Sigue en disco? Se mira antes de enviar: sin él no hay nada que subir. */
export const headerMediaFileExists = async (media) => {
    const ruta = rutaDeArchivo(MEDIA_DIR, media.file);
    return Boolean(ruta) && fs.access(ruta).then(() => true, () => false);
};

/** El archivo de la cabecera tal como lo ve el frontend (o `null`). */
export const serializeHeaderMedia = (media) => (media?._id ? {
    id: String(media._id),
    mimeType: media.mimeType,
    filename: media.filename,
    size: media.size,
} : null);
