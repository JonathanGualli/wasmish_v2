import { useConversations } from "../../hooks/useConversations";
import { useTemplates } from "../../hooks/useTemplates";
import { renderLegacyTemplateText } from "../../utils/legacyTemplate";

interface Props {
    onSelect: (id: string) => void;
    selectedId?: string | null;
}

export const ChatconversationList = ({ onSelect, selectedId }: Props) => {

    const { data: conversations, isLoading, isError } = useConversations();
    const { templates } = useTemplates();

    if (isLoading) return <div className="flex items-center justify-center h-full text-brand-muted bg-brand-surface">Cargando conversaciones...</div>

    if (isError) return <div className="flex items-center justify-center h-full text-brand-danger bg-brand-surface">¡Error al cargar las conversaciones!</div>

    if(!conversations || conversations.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-brand-muted bg-brand-surface">
                No hay conversaciones disponibles.
            </div>
        );
    }

    return (
        <div className="bg-brand-surface h-full w-full flex flex-col overflow-y-auto">
            {conversations?.map((chat) => (
                <div key={chat.id}
                    onClick={() => {
                        onSelect(chat.id);
                    }}
                    className={`px-4 py-3 border-b border-brand-border cursor-pointer transition-colors
                              ${selectedId === chat.id ? 'bg-brand-accent/10' : 'hover:bg-brand-raised'}`}>

                    <div className="flex justify-between items-center gap-2">
                        <div>
                            <h1 className={`font-semibold truncate ${selectedId === chat.id ? 'text-brand-accent-strong' : 'text-brand-text'}`}>
                                {chat.title || chat.phone}
                            </h1>
                            {/* El titulo ya ES el teléfono cuando el contacto no tiene nombre */}
                            {chat.title && chat.title !== chat.phone && ( 
                                <span className="text-xs text-brand-subtle tabular-nums flex-shrink-0">
                                    +{chat.phone}
                                </span>
                            )}
                        </div>
                        <span className="text-xs text-brand-subtle flex-shrink-0">
                            {new Date(chat.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>

                    <div className="flex justify-between items-center gap-2 mt-0.5">
                        <h3 className="text-brand-muted text-sm truncate">
                            {renderLegacyTemplateText(chat.lastMessage, templates) || "Sin mensajes aún"}
                        </h3>

                        {chat.unreadCount > 0 && (
                            <span className="flex-shrink-0 inline-flex items-center justify-center bg-brand-accent text-black text-xs font-medium rounded-full min-w-5 h-5 px-1.5">
                                {chat.unreadCount}
                            </span>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
