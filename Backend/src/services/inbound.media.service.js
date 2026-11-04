// Bajar el archivo de un mensaje que llega de Meta (un entrante en vivo, un eco
// o un mensaje del historial de la app) y dejarlo en `MEDIA_DIR`.

import { TIPOS_CON_ARCHIVO, nombreDeArchivo, guardarArchivo } from '../utils/media.storage.js';
import { getMediaInfo, downloadMedia } from '../libs/whatsapp.js';
import { decrypt } from '../utils/crypto.js';
import { MEDIA_DIR, MEDIA_MAX_BYTES } from '../config.js';

// Baja el adjunto y lo deja en disco. Devuelve SIEMPRE un objeto: si algo falla
// —token caducado, archivo enorme, Meta caída— sale con mediaFile en null y el
// mensaje se guarda igual con su etiqueta. Perder la foto es un problema;
// perder el mensaje entero sería mucho peor.
export const descargarAdjunto = async (inbound, entrante) => {
    const vacio = { mediaFile: null, mediaFilename: null, mediaSize: null, mimeType: entrante.mimeType };

    if (!entrante.mediaId || !TIPOS_CON_ARCHIVO.has(entrante.type)) return vacio;
    // El token es el del WABA de la línea; sin él no hay con qué pedir el archivo.
    if (!inbound.tokenWhatsapp) return vacio;

    try {
        const token = decrypt(inbound.tokenWhatsapp);
        if (!token) return vacio;

        const info = await getMediaInfo({ token, mediaId: entrante.mediaId });

        // El tamaño se comprueba ANTES de bajar: si no, el tope solo actuaría
        // después de habernos tragado los bytes.
        const tamano = Number(info?.file_size ?? 0);
        if (tamano > MEDIA_MAX_BYTES) {
            console.warn('Adjunto omitido por tamaño:', { mediaId: entrante.mediaId, tamano, tope: MEDIA_MAX_BYTES });
            return vacio;
        }

        // El mime de la descarga manda sobre el del webhook: es el que Meta usa
        // de verdad para el archivo.
        const mimeType = info?.mime_type ?? entrante.mimeType;
        const nombre = nombreDeArchivo(entrante.mediaId, mimeType);
        if (!nombre) return vacio;

        const contenido = await downloadMedia({ token, url: info.url, maxBytes: MEDIA_MAX_BYTES });
        await guardarArchivo(MEDIA_DIR, nombre, contenido);

        return { mediaFile: nombre, mediaFilename: entrante.filename ?? null, mediaSize: contenido.length, mimeType };
    } catch (error) {
        console.error('No se pudo descargar el adjunto:', {
            mediaId: entrante.mediaId, type: entrante.type,
            error: error.waErrorDetail ?? error.message,
        });
        return vacio;
    }
};

