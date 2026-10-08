import { CircleAlert } from "lucide-react";
import { useSendMediaMessage } from "../../hooks/useSendMediaMessage";
import type { Message, PendingUpload } from "../../models/message.mode";
import { uploadPercent } from "../../utils/outboundMedia";

/**
 * El acuse de un archivo que se envía desde este navegador: mientras sube, el
 * progreso real y «Cancelar», y «Enviando…» cuando ya está en el servidor; si
 * no llegó al servidor, «Reintentar» (el archivo
 * sigue aquí) o «Quitar». Los demás fallos usan el globo de «Fallido» de siempre.
 */
export const MessageUploadStatus = ({ msg }: { msg: Message & { pending: PendingUpload } }) => {
    const { retry, discard } = useSendMediaMessage();
    const temporalId = msg.temporalId ?? msg.id;

    if (msg.status === "failed") {
        return (
            <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-brand-danger">
                <span className="inline-flex items-center gap-1 font-semibold">
                    <CircleAlert className="w-3.5 h-3.5" />No se pudo subir.
                </span>
                <button type="button" onClick={() => retry(msg.conversationId, temporalId)}
                    className="font-semibold underline cursor-pointer">
                    Reintentar
                </button>
                <button type="button" onClick={() => discard(msg.conversationId, temporalId)}
                    className="text-brand-muted hover:text-brand-text underline cursor-pointer">
                    Quitar
                </button>
            </span>
        );
    }

    // Subido entero: el servidor lo está mandando a WhatsApp. Cancelar ya no
    // lo pararía, así que no se ofrece.
    const percent = uploadPercent(msg.pending);
    if (percent >= 100) return <span>Enviando…</span>;

    return (
        <span className="inline-flex items-center gap-2">
            <span>Subiendo… <span className="font-mono tabular-nums">{percent} %</span></span>
            <button type="button" onClick={() => discard(msg.conversationId, temporalId)}
                className="font-semibold text-brand-strong hover:underline cursor-pointer">
                Cancelar
            </button>
        </span>
    );
};
