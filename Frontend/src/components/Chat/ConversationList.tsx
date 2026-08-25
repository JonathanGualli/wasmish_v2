import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useConversations } from "../../hooks/useConversations";
import { useTemplates } from "../../hooks/useTemplates";
import { renderLegacyTemplateText } from "../../utils/legacyTemplate";
import { formatChatTime } from "../../utils/formatChatTime";
import { initials } from "../../utils/initials";

interface Props {
    onSelect: (id: string) => void;
    selectedId?: string | null;
    onNewConversation: () => void;
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
 * Los filtros (Todos / Míos / Sin asignar) y las etiquetas de la maqueta no
 * están: dependen de asignación y etiquetado, que el backend todavía no tiene.
 */
export const ChatconversationList = ({ onSelect, selectedId, onNewConversation }: Props) => {
    const { data: conversations, isLoading, isError } = useConversations();
    const { templates } = useTemplates();
    const [query, setQuery] = useState('');

    const unread = useMemo(
        () => conversations?.reduce((n, c) => n + (c.unreadCount > 0 ? 1 : 0), 0) ?? 0,
        [conversations]
    );

    const visible = useMemo(() => {
        if (!conversations) return [];
        const q = query.trim().toLowerCase();
        if (!q) return conversations;
        return conversations.filter(c =>
            (c.title ?? '').toLowerCase().includes(q) || (c.phone ?? '').includes(q)
        );
    }, [conversations, query]);

    const renderRows = () => {
        if (isLoading) return <CenteredState>Cargando conversaciones…</CenteredState>;
        if (isError) return <CenteredState tone="danger">¡Error al cargar las conversaciones!</CenteredState>;
        if (!conversations || conversations.length === 0) {
            return <CenteredState>Todavía no hay conversaciones. Empieza una con el botón +.</CenteredState>;
        }
        if (visible.length === 0) {
            return <CenteredState>Ninguna conversación coincide con «{query}».</CenteredState>;
        }

        return visible.map((chat) => {
            const isActive = selectedId === chat.id;
            const title = chat.title || chat.phone;

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
                        <div className="flex gap-2 items-baseline">
                            <span className="text-sm font-semibold text-brand-text truncate">{title}</span>
                            <span className="font-mono text-[11px] text-brand-subtle ml-auto flex-none">
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

                <div className="mt-3 relative flex items-center">
                    <Search size={16} className="absolute left-[11px] text-brand-subtle pointer-events-none" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Buscar conversación o número"
                        className="w-full box-border text-[13px] text-brand-text bg-brand-bg
                            border border-brand-border rounded-lg py-2.5 pl-[34px] pr-3
                            placeholder:text-brand-subtle
                            focus:outline-none focus:bg-brand-surface focus:border-brand-success
                            focus:ring-[3px] focus:ring-brand-accent-soft transition-colors"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
                {renderRows()}
            </div>
        </div>
    );
};
