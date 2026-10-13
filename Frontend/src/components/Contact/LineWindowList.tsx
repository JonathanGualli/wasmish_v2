import { formatRemaining, useConversationWindow } from "../../hooks/useConversationWindow";
import { useLines } from "../../hooks/useLines";
import type { ContactConversation } from "../../models/contact.model";
import { formatTimeAgo } from "../../utils/formatChatTime";
import { lineLabel } from "../../utils/lineDisplay";
import { LineSwatch } from "../Line/LineSwatch";

interface Props {
    /** Las del contacto, una por línea, la más reciente primero (como las da el backend). */
    conversations: ContactConversation[];
    /** La que está abierta en el chat: va resaltada y no se puede tocar. */
    currentConversationId?: string;
    /** Tocar otra fila abre esa conversación. */
    onOpen?: (conversationId: string) => void;
    /** Con borde en Contactos (sobre blanco); sin él en la ficha del chat, como sus otras tarjetas. */
    framed?: boolean;
}

/**
 * La ventana de 24 h de un contacto con varias líneas: es de cada número, así
 * que va una fila por conversación con su línea, abierta (y lo que queda) o
 * cerrada (y desde cuándo). Con una sola línea no se usa: la ficha enseña la
 * ventana como siempre.
 *
 * Siempre sobre blanco: en la ficha del chat iba sobre el verde profundo de la
 * cabecera, y los colores de las líneas y los estados se perdían en él.
 */
export const LineWindowList = ({ conversations, currentConversationId, onOpen, framed = false }: Props) => (
    <div className={`grid bg-brand-surface rounded-xl py-1 ${framed ? 'border border-brand-border' : ''}`}>
        <div className="px-3.5 pt-2 pb-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-brand-muted">
            Ventana de 24 h · por línea
        </div>
        {conversations.map(conversation => (
            <LineWindowRow key={conversation.conversationId} conversation={conversation}
                current={conversation.conversationId === currentConversationId}
                highlight={conversations.length > 1} onOpen={onOpen} />
        ))}
    </div>
);

const LineWindowRow = ({ conversation, current, highlight, onOpen }: {
    conversation: ContactConversation;
    current: boolean;
    /** Resaltar la abierta: solo con más de una fila, si no no hay de cuál distinguirla. */
    highlight: boolean;
    onOpen?: (conversationId: string) => void;
}) => {
    const { lineById, colorOf } = useLines();
    const line = lineById(conversation.lineId);
    const { hasWindow, isOpen, msRemaining, msSinceClosed } = useConversationWindow(conversation.windowExpiresAt);
    const [state, detail] = isOpen
        ? ['Abierta', formatRemaining(msRemaining)]
        : hasWindow ? ['Cerrada', formatTimeAgo(msSinceClosed)] : ['Nunca escribió', ''];
    const clickable = Boolean(onOpen) && !current;
    const disconnected = line?.status === 'disconnected';

    return (
        <button type="button" disabled={!clickable} onClick={() => onOpen?.(conversation.conversationId)}
            title={clickable ? 'Abrir esta conversación' : undefined}
            className={`flex items-center gap-[9px] px-3.5 py-2 text-[12.5px] text-left transition-colors
                ${current && highlight ? 'bg-brand-bg' : ''} ${clickable ? 'cursor-pointer hover:bg-brand-bg' : 'cursor-default'}`}>
            {line && <LineSwatch colorClass={colorOf(line.id)} disconnected={disconnected} size="sm" />}
            <span className="min-w-0 grid">
                <span className="truncate font-semibold text-brand-text">{line ? lineLabel(line) : 'Número anterior'}</span>
                {disconnected && <span className="text-[11px] text-brand-muted">Desconectada</span>}
            </span>
            <span className="ml-auto flex-none inline-flex items-center gap-1.5 text-brand-strong">
                <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? 'bg-brand-success' : 'bg-brand-subtle'}`} />
                {state}
            </span>
            {detail && (
                <span className={`flex-none font-mono tabular-nums text-right ${isOpen ? 'text-brand-accent-strong' : 'text-brand-muted'}`}>
                    {detail}
                </span>
            )}
        </button>
    );
};
