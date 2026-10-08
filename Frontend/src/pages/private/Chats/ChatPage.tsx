import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChatThread } from "../../../components/Chat/ChatThread";
import { ChatconversationList } from "../../../components/Chat/ConversationList";
import { NewConversationPanel } from "../../../components/Chat/NewConversationPanel";
import { useAuthContext } from "../../../context/auth.context";
import {
    EMPTY_DRAFT, clearDraft, loadDraft, saveDraft, type ConversationDraft,
} from "../../../utils/conversationDraft";
import type { ChatsNavigationState } from "../../../models/conversation.mode";

/**
 * Bandeja + conversación — «Sidebar y Chats» del manual de marca v1.0.
 * La lista es de 360px fijos; el hilo se queda con el resto.
 * En móvil se ve una cosa u otra: la lista, o la conversación abierta.
 *
 * La conversación nueva ocupa el sitio del hilo (no es un modal). El borrador
 * vive aparte de que esté abierto: abrir otra conversación solo lo oculta, y la
 * bandeja lo sigue enseñando arriba para volver a él. Se borra al descartarlo,
 * al enviarlo, al cerrar sesión o al cerrar la pestaña (sessionStorage).
 *
 * Otra página puede pedir al navegar que se abra una conversación o un
 * borrador nuevo (`ChatsNavigationState`, desde la ficha de un contacto). El
 * borrador pedido reemplaza al que hubiera, sin preguntar.
 *
 * La ficha del contacto se abre para una conversación: abrir otra, o volver a
 * Chats desde otra página, la deja cerrada.
 */
export const ChatPage = () => {
    const { user } = useAuthContext();
    const userId = user?.id ?? "";
    const location = useLocation();
    const navigate = useNavigate();
    const incoming = location.state as ChatsNavigationState | null;

    const [selectedId, setSelectedId] = useState<string | null>(incoming?.conversationId ?? null);
    const [draft, setDraft] = useState<ConversationDraft | null>(() =>
        incoming?.draft ? { ...EMPTY_DRAFT, ...incoming.draft } : (userId ? loadDraft(userId) : null));
    const [draftOpen, setDraftOpen] = useState(Boolean(incoming?.draft));
    // De qué conversación está abierta la ficha: cambiar de conversación la
    // deja cerrada sin tener que acordarse de cerrarla.
    const [contactSidebarFor, setContactSidebarFor] = useState<string | null>(null);
    const contactSidebarOpen = Boolean(selectedId) && contactSidebarFor === selectedId;

    // La petición se usa una sola vez: si se quedara en el historial, recargar
    // la página volvería a pisar el borrador. (El borrador pedido lo guarda el
    // propio panel al montarse, vía handleDraftChange.)
    useEffect(() => {
        if (incoming) navigate(location.pathname, { replace: true, state: null });
    }, [incoming, navigate, location.pathname]);

    // ESC cierra lo que esté abierto, de fuera hacia dentro: primero la ficha,
    // luego la conversación. El borrador solo se oculta: no se pierde.
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            // Un diálogo abierto (enviar plantilla) se cierra con su propio Esc;
            // cerrar además la conversación tiraba lo escrito en ella.
            if (document.querySelector('[aria-modal="true"]')) return;
            if (contactSidebarOpen) {
                setContactSidebarFor(null);
                return;
            }
            setSelectedId(null);
            setDraftOpen(false);
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [contactSidebarOpen]);

    const openConversation = (id: string) => {
        setDraftOpen(false);
        setSelectedId(id);
        // Volver a la misma de antes también la abre sin ficha.
        setContactSidebarFor(null);
    };

    // El «+» y la fila «Borrador» hacen lo mismo: abren el borrador que haya,
    // o uno vacío si no hay ninguno.
    const openDraft = () => {
        setSelectedId(null);
        setDraft(d => d ?? EMPTY_DRAFT);
        setDraftOpen(true);
    };

    // Estable: el panel la llama desde un efecto en cada cambio.
    const handleDraftChange = useCallback((next: ConversationDraft) => {
        setDraft(next);
        if (userId) saveDraft(userId, next);
    }, [userId]);

    const discardDraft = () => {
        clearDraft(userId);
        setDraft(null);
        setDraftOpen(false);
    };

    const handleCreated = (conversationId: string) => {
        clearDraft(userId);
        setDraft(null);
        openConversation(conversationId);
    };

    const paneOpen = Boolean(selectedId || draftOpen);

    return (
        <div className="bg-brand-bg h-full w-full flex flex-row overflow-hidden min-h-0">
            <div className={`h-full min-w-0 overflow-hidden border-r border-brand-border
                w-full md:w-[360px] md:flex-none ${paneOpen ? 'hidden md:block' : 'block'}`}>
                <ChatconversationList
                    onSelect={openConversation}
                    selectedId={selectedId}
                    onNewConversation={openDraft}
                    draft={draft}
                    draftActive={draftOpen}
                    onOpenDraft={openDraft}
                />
            </div>

            <div className={`h-full flex-1 min-w-0 ${paneOpen ? 'block' : 'hidden md:block'}`}>
                {draftOpen && draft ? (
                    <NewConversationPanel
                        initialDraft={draft}
                        onClose={discardDraft}
                        onBack={() => setDraftOpen(false)}
                        onCreated={handleCreated}
                        onOpenExisting={openConversation}
                        onDraftChange={handleDraftChange}
                    />
                ) : (
                    <ChatThread
                        conversationId={selectedId}
                        onBack={() => setSelectedId(null)}
                        contactSidebarOpen={contactSidebarOpen}
                        onContactSidebarChange={open => setContactSidebarFor(open ? selectedId : null)}
                    />
                )}
            </div>
        </div>
    );
};
