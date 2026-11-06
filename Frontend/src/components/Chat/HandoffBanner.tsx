import { UserRound } from "lucide-react";
import { useNotice } from "../Notice/context/useNotice";
import { useClearHandoffRequest } from "../../hooks/useClearHandoffRequest";
import { contactFirstName } from "../../utils/assignment";
import { formatSince } from "../../utils/formatChatTime";

/**
 * «Pide una persona» bajo la cabecera del chat (bot con menús, diseño
 * «Respuestas automáticas v4», c1): el contacto tocó «Hablar con una persona»
 * y el bot se calla hasta que alguien del equipo responde o se quita aquí.
 * Ámbar, para no confundirlo con un no leído (menta).
 */
export const HandoffBanner = ({ conversationId, title, since }: { conversationId: string; title: string; since: string }) => {
    const { notify } = useNotice();
    const clear = useClearHandoffRequest(conversationId);

    const onClear = () => clear.mutate(undefined, {
        onError: () => notify({ kind: 'error', text: 'No se pudo quitar la marca. Vuelve a intentarlo.' }),
    });

    return (
        <div className="flex-none flex items-center gap-3 px-5 max-md:px-4 py-2.5 bg-brand-handoff-wash border-b border-brand-handoff-border">
            <span className="flex-none w-7 h-7 rounded-[7px] bg-brand-handoff text-white flex items-center justify-center">
                <UserRound size={15} strokeWidth={2.4} />
            </span>
            <p className="flex-1 min-w-0 text-[13.5px] leading-[1.45] text-brand-strong">
                <b className="font-semibold text-brand-text">{contactFirstName(title)} pide hablar con una persona</b>{' '}
                <span className="font-mono text-[11.5px] text-brand-muted">· {formatSince(since)}</span>
                {/* En el teléfono no cabe: lo dice también la línea sobre el composer. */}
                <br className="max-md:hidden" />
                <span className="max-md:hidden text-brand-gray-600">
                    El bot no responde en esta conversación. Se quita sola cuando alguien del equipo contesta.
                </span>
            </p>
            <button type="button" onClick={onClear} disabled={clear.isPending}
                className="flex-none h-[34px] px-3.5 rounded-[8px] border border-brand-handoff-button bg-brand-surface text-[13px] font-semibold
                    text-brand-strong hover:bg-brand-handoff-unseen transition-colors cursor-pointer disabled:cursor-default disabled:text-brand-subtle">
                Quitar
            </button>
        </div>
    );
};
