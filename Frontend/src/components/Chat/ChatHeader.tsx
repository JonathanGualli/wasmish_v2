import { ChevronLeft, PanelRight } from "lucide-react";
import type { Conversation } from "../../models/conversation.mode";
import { initials } from "../../utils/initials";

interface Props {
    conversation: Conversation;
    /** Volver a la bandeja en móvil, donde lista e hilo no caben a la vez. */
    onBack?: () => void;
    contactSidebarOpen: boolean;
    onToggleContactSidebar: () => void;
}

/**
 * Cabecera de la conversación. «Ficha» abre la del contacto, y el nombre y el
 * avatar también (no todo el mundo descubre el clic en el nombre, por eso el
 * botón). Una conversación anterior a los contactos sin enlazar no tiene ficha.
 */
export const ChatHeader = ({ conversation, onBack, contactSidebarOpen, onToggleContactSidebar }: Props) => {
    const title = conversation.title || conversation.phone || "";
    const identity = conversation.phone ? `+${conversation.phone}` : conversation.username && `@${conversation.username}`;
    const hasContact = Boolean(conversation.contactId);

    return (
        <div className="bg-brand-surface border-b border-brand-border px-4 md:px-6 py-3.5 flex items-center gap-3 flex-none">
            {onBack && (
                <button
                    type="button"
                    onClick={onBack}
                    title="Volver a la bandeja"
                    className="md:hidden -ml-1 text-brand-strong hover:text-brand-text transition-colors cursor-pointer flex-none"
                >
                    <ChevronLeft size={22} strokeWidth={2.2} />
                </button>
            )}
            <button
                type="button"
                onClick={onToggleContactSidebar}
                disabled={!hasContact}
                title={hasContact ? "Ver la ficha del contacto" : undefined}
                className="min-w-0 flex items-center gap-3 text-left cursor-pointer disabled:cursor-default"
            >
                <span className="w-9 h-9 rounded-[9px] bg-brand-accent-soft text-brand-accent-strong
                    text-xs font-bold flex items-center justify-center flex-none">
                    {initials(title)}
                </span>
                <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-brand-text truncate">{title}</span>
                    <span className={`font-mono text-[11px] text-brand-muted ${hasContact ? 'hidden md:block' : 'block'}`}>
                        {identity}
                    </span>
                    {hasContact && <span className="block md:hidden text-xs text-brand-muted">Toca para ver la ficha</span>}
                </span>
            </button>
            {hasContact && (
                <button
                    type="button"
                    onClick={onToggleContactSidebar}
                    aria-pressed={contactSidebarOpen}
                    title={contactSidebarOpen ? "Cerrar la ficha" : "Ver la ficha del contacto"}
                    className={`ml-auto flex-none flex items-center gap-2 h-11 md:h-9 px-3 rounded-[8px] border text-[13px]
                        font-semibold transition-colors cursor-pointer
                        ${contactSidebarOpen
                            ? 'bg-brand-accent-soft border-brand-accent-soft text-brand-accent-strong'
                            : 'bg-brand-surface border-brand-border-strong text-brand-strong hover:bg-brand-bg'}`}
                >
                    <PanelRight size={16} />
                    <span className="hidden md:inline">Ficha</span>
                </button>
            )}
        </div>
    );
};
