import { formatRemaining, useConversationWindow } from "../../hooks/useConversationWindow";
import { useLines } from "../../hooks/useLines";
import type { ContactConversation } from "../../models/contact.model";
import { formatTimeAgo } from "../../utils/formatChatTime";
import { lineLabel } from "../../utils/lineDisplay";
import { LineSwatch } from "../Line/LineSwatch";

type Tone = 'onDeep' | 'light';

interface Props {
    /** Las del contacto, una por línea, la más reciente primero (como las da el backend). */
    conversations: ContactConversation[];
    /** La que está abierta en el chat: va resaltada y no se puede tocar. */
    currentConversationId?: string;
    /** Tocar otra fila abre esa conversación. */
    onOpen?: (conversationId: string) => void;
    /** `onDeep` en la ficha del chat (sobre verde profundo); `light` en Contactos. */
    tone: Tone;
}

const TONES = {
    onDeep: {
        box: 'bg-brand-ink rounded-[9px] py-1',
        heading: 'text-brand-on-deep-subtle',
        row: 'hover:bg-brand-deep', current: 'bg-brand-deep',
        name: 'text-white', state: 'text-brand-on-deep',
        openDetail: 'text-brand-accent', closedDetail: 'text-brand-on-deep-muted',
        openDot: 'bg-brand-accent', closedDot: 'bg-brand-on-deep-subtle',
    },
    light: {
        box: 'border border-brand-border rounded-xl py-1',
        heading: 'text-brand-muted',
        row: 'hover:bg-brand-bg', current: 'bg-brand-bg',
        name: 'text-brand-text', state: 'text-brand-strong',
        openDetail: 'text-brand-accent-strong', closedDetail: 'text-brand-muted',
        openDot: 'bg-brand-success', closedDot: 'bg-brand-subtle',
    },
} as const;

/**
 * La ventana de 24 h de un contacto con varias líneas: es de cada número, así
 * que va una fila por conversación con su línea, abierta (y lo que queda) o
 * cerrada (y desde cuándo). Con una sola línea no se usa: la ficha enseña la
 * ventana como siempre.
 */
export const LineWindowList = ({ conversations, currentConversationId, onOpen, tone }: Props) => {
    const t = TONES[tone];
    return (
        <div className={`grid ${t.box}`}>
            <div className={`px-3 pt-[7px] pb-[3px] text-[10.5px] font-bold uppercase tracking-[0.1em] ${t.heading}`}>
                Ventana de 24 h · por línea
            </div>
            {conversations.map(conversation => (
                <LineWindowRow key={conversation.conversationId} conversation={conversation} tone={tone}
                    current={conversation.conversationId === currentConversationId} onOpen={onOpen} />
            ))}
        </div>
    );
};

const LineWindowRow = ({ conversation, tone, current, onOpen }: {
    conversation: ContactConversation;
    tone: Tone;
    current: boolean;
    onOpen?: (conversationId: string) => void;
}) => {
    const t = TONES[tone];
    const { lineById, colorOf } = useLines();
    const line = lineById(conversation.lineId);
    const { hasWindow, isOpen, msRemaining, msSinceClosed } = useConversationWindow(conversation.windowExpiresAt);
    const [state, detail] = isOpen
        ? ['Abierta', formatRemaining(msRemaining)]
        : hasWindow ? ['Cerrada', formatTimeAgo(msSinceClosed)] : ['Nunca escribió', ''];
    const clickable = Boolean(onOpen) && !current;

    return (
        <button type="button" disabled={!clickable} onClick={() => onOpen?.(conversation.conversationId)}
            title={clickable ? 'Abrir esta conversación' : undefined}
            className={`flex items-center gap-[9px] px-3 py-2 text-[12.5px] text-left transition-colors
                ${current ? t.current : ''} ${clickable ? `cursor-pointer ${t.row}` : 'cursor-default'}`}>
            {line && <LineSwatch colorClass={colorOf(line.id)} disconnected={line.status === 'disconnected'} size="sm" />}
            <span className={`min-w-0 truncate font-semibold ${t.name}`}>{line ? lineLabel(line) : 'Número anterior'}</span>
            <span className={`ml-auto flex-none inline-flex items-center gap-1.5 ${t.state}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? t.openDot : t.closedDot}`} />
                {state}
            </span>
            {detail && (
                <span className={`flex-none font-mono tabular-nums text-right ${isOpen ? t.openDetail : t.closedDetail}`}>{detail}</span>
            )}
        </button>
    );
};
