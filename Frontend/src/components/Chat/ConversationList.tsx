import { useMemo, useState } from "react";
import { SearchInput } from "../SearchInput/SearchInput";
import { Plus } from "lucide-react";
import { useConversations } from "../../hooks/useConversations";
import { useTemplates } from "../../hooks/useTemplates";
import { renderLegacyTemplateText } from "../../utils/legacyTemplate";
import { formatChatTime } from "../../utils/formatChatTime";
import { initials } from "../../utils/initials";
import { draftTitle, type ConversationDraft } from "../../utils/conversationDraft";
import { useLines } from "../../hooks/useLines";
import { LineChip } from "../Line/LineChip";
import { ALL_LINES, LineFilter } from "./LineFilter";

interface Props {
    onSelect: (id: string) => void;
    selectedId?: string | null;
    onNewConversation: () => void;
    /** Conversación nueva a medio escribir: va arriba del todo mientras exista. */
    draft?: ConversationDraft | null;
    /** El borrador es lo que está abierto ahora (si no, otra conversación). */
    draftActive?: boolean;
    onOpenDraft?: () => void;
}

const CenteredState = ({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'danger' }) => (
    <div className={`flex-1 flex items-center justify-center p-6 text-center text-sm
        ${tone === 'danger' ? 'text-brand-danger' : 'text-brand-muted'}`}>
        {children}
    </div>
);

/**
 * La bandeja — «Sidebar y Chats» del manual de marca v1.0.
 * Cabecera con el contador de sin leer y la conversación nueva, buscador, y
 * filas de 38px de avatar. La abierta se marca con borde izquierdo verde profundo.
 *
 * Con más de una línea, cada conversación lleva la etiqueta de la suya junto a
 * la hora, y bajo la búsqueda se filtra por línea (en el cliente: la lista ya
 * trae todas). El contador de sin leer es el de lo que se ve.
 *
 * Los filtros (Todos / Míos / Sin asignar) y las etiquetas de la maqueta no
 * están: dependen de asignación y etiquetado, que el backend todavía no tiene.
 */
export const ChatconversationList = ({ onSelect, selectedId, onNewConversation, draft, draftActive, onOpenDraft }: Props) => {
    const { data: conversations, isLoading, isError } = useConversations();
    const { templates } = useTemplates();
    const { lineById, showLines } = useLines();
    const [query, setQuery] = useState('');
    const [lineFilter, setLineFilter] = useState(ALL_LINES);
    // Una línea que ya no está (u otra cuenta en la misma pestaña) vuelve a «todas».
    const filterLineId = showLines && lineById(lineFilter) ? lineFilter : ALL_LINES;

    const ofLine = useMemo(
        () => (filterLineId === ALL_LINES ? conversations ?? [] : (conversations ?? []).filter(c => c.lineId === filterLineId)),
        [conversations, filterLineId]
    );

    const unread = useMemo(() => ofLine.reduce((n, c) => n + (c.unreadCount > 0 ? 1 : 0), 0), [ofLine]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return ofLine;
        return ofLine.filter(c =>
            (c.title ?? '').toLowerCase().includes(q)
            || (c.phone ?? '').includes(q)
            || (c.username ?? '').toLowerCase().includes(q.replace(/^@/, ''))
        );
    }, [ofLine, query]);

    const renderRows = () => {
        if (isLoading) return <CenteredState>Cargando conversaciones…</CenteredState>;
        if (isError) return <CenteredState tone="danger">¡Error al cargar las conversaciones!</CenteredState>;
        if (!conversations || conversations.length === 0) {
            return <CenteredState>Todavía no hay conversaciones. Empieza una con el botón +.</CenteredState>;
        }
        if (visible.length === 0) {
            return <CenteredState>
                {query.trim() ? `Ninguna conversación coincide con «${query}».` : 'Esta línea todavía no tiene conversaciones.'}
            </CenteredState>;
        }

        return visible.map((chat) => {
            const isActive = selectedId === chat.id;
            const { title } = chat;

            return (
                <button
                    key={chat.id}
                    type="button"
                    onClick={() => onSelect(chat.id)}
                    className={`w-full text-left flex gap-3 px-[18px] py-3.5 border-b border-brand-bg
                        border-l-[3px] cursor-pointer transition-colors
                        ${isActive
                            ? 'bg-brand-bg border-l-brand-deep'
                            : 'border-l-transparent hover:bg-brand-bg'}`}
                >
                    <div className={`w-[38px] h-[38px] rounded-[10px] flex items-center justify-center flex-none
                        text-xs font-bold
                        ${isActive ? 'bg-brand-deep text-brand-accent' : 'bg-brand-raised text-brand-gray-600'}`}>
                        {initials(title)}
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex gap-2 items-center">
                            <span className="text-sm font-semibold text-brand-text truncate">{title}</span>
                            <span className="ml-auto flex-none font-mono text-[11px] text-brand-subtle">
                                {formatChatTime(chat.updatedAt)}
                            </span>
                        </div>

                        <div className="flex gap-2 items-center mt-0.5">
                            <span className="text-[13px] text-brand-muted truncate">
                                {renderLegacyTemplateText(chat.lastMessage, templates) || 'Sin mensajes aún'}
                            </span>
                            {chat.unreadCount > 0 && (
                                <span className="ml-auto flex-none inline-flex items-center justify-center
                                    min-w-[18px] h-[18px] px-1.5 rounded-[9px]
                                    bg-brand-accent text-brand-ink text-[10px] font-bold tabular-nums">
                                    {chat.unreadCount}
                                </span>
                            )}
                        </div>

                        {/* La línea, en su propia fila: junto a la hora le quitaba sitio al
                            nombre. Con una sola línea, LineChip no pinta nada y la fila no existe. */}
                        <div className="empty:hidden mt-1 flex min-w-0"><LineChip lineId={chat.lineId} wide /></div>
                    </div>
                </button>
            );
        });
    };

    return (
        <div className="bg-brand-surface h-full w-full flex flex-col min-h-0">
            {/* Cabecera de la bandeja */}
            <div className="px-[18px] pt-5 pb-3.5 border-b border-brand-raised shrink-0">
                <div className="flex items-baseline gap-2">
                    <h2 className="text-xl font-bold tracking-[-0.025em] text-brand-text">Bandeja</h2>
                    <span className="text-[13px] text-brand-muted ml-auto">
                        {unread > 0 ? `${unread} sin leer` : 'Todo al día'}
                    </span>
                    <button
                        type="button"
                        onClick={onNewConversation}
                        title="Conversación nueva"
                        className="self-center w-8 h-8 rounded-lg bg-brand-accent hover:bg-brand-accent-hover
                            flex items-center justify-center cursor-pointer transition-colors flex-none"
                    >
                        <Plus size={17} strokeWidth={2.4} className="text-brand-ink" />
                    </button>
                </div>

                <SearchInput value={query} onChange={setQuery} placeholder="Buscar conversación o número" className="mt-3" />
                <div className="empty:hidden mt-2.5">
                    <LineFilter value={filterLineId} onChange={setLineFilter} conversations={conversations ?? []} />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
                {draft && (
                    <button
                        type="button"
                        onClick={onOpenDraft}
                        className={`w-full text-left flex gap-3 px-[18px] py-3.5 border-b border-brand-bg
                            border-l-[3px] cursor-pointer transition-colors
                            ${draftActive
                                ? 'bg-brand-bg border-l-brand-deep'
                                : 'border-l-transparent hover:bg-brand-bg'}`}
                    >
                        <div className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center flex-none
                            border border-dashed border-brand-border-strong bg-brand-surface text-brand-muted">
                            <Plus size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-brand-text truncate">{draftTitle(draft)}</div>
                            <div className="text-[13px] text-brand-muted truncate mt-0.5">
                                {draft.templateName ? `Plantilla ${draft.templateName}` : 'Sin plantilla todavía'}
                            </div>
                            <span className="inline-block mt-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold
                                uppercase tracking-[0.05em] bg-brand-raised text-brand-muted">
                                Borrador
                            </span>
                        </div>
                    </button>
                )}
                {renderRows()}
            </div>
        </div>
    );
};
