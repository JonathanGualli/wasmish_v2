import fs from 'node:fs';
import Message from '../models/message.model.js';
import Conversation from '../models/conversation.model.js';
import { MEDIA_DIR } from '../config.js';
import { rutaDeArchivo, mimeParaServir } from '../utils/media.storage.js';

// Sirve el adjunto de un mensaje. Se pide por el id del MENSAJE, no por el del
// archivo: así la comprobación de propietario es la misma de siempre
// (mensaje → conversación → userId) y no hay forma de pedir el archivo de otro
// aunque se conozca su mediaId, que además viaja en los payloads de Meta.
export const getMedia = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const message = await Message.findById(id).lean();
        if (!message?.mediaFile) return res.status(404).json([{ message: "Media not found" }]);

        const conversation = await Conversation.findOne({ _id: message.conversationId, userId }).lean();
        if (!conversation) return res.status(404).json([{ message: "Media not found" }]);

        const ruta = rutaDeArchivo(MEDIA_DIR, message.mediaFile);
        if (!ruta || !fs.existsSync(ruta)) {
            // El registro dice que hay archivo pero en disco no está: pasa si se
            // restauró la BD sin el volumen, o si alguien limpió los medios.
            console.error('Adjunto ausente en disco:', { messageId: id, mediaFile: message.mediaFile });
            return res.status(404).json([{ message: "Media not found" }]);
        }

        res.setHeader('Content-Type', mimeParaServir(message.mimeType));
        // Privado: la respuesta depende de la cookie de sesión, así que ningún
        // intermediario debe cachearla y servírsela a otro usuario.
        res.setHeader('Cache-Control', 'private, max-age=86400');

        // Los documentos se descargan con su nombre original; lo demás se muestra
        // dentro de la conversación. El nombre va entre comillas y sin saltos de
        // línea para que no pueda inyectar cabeceras.
        if (message.type === 'document') {
            const nombre = String(message.mediaFilename ?? message.mediaFile).replace(/["\r\n]/g, '');
            res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
        } else {
            res.setHeader('Content-Disposition', 'inline');
        }

        return fs.createReadStream(ruta).pipe(res);
    } catch (error) {
        return res.status(500).json([{ message: error.message }]);
    }
};
