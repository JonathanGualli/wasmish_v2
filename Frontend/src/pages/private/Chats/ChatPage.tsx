import { useEffect, useState } from "react";
import { ChatThread } from "../../../components/Chat/ChatThread";
import { ChatconversationList } from "../../../components/Chat/ConversationList";
import { NewConversationDialog } from "../../../components/Chat/NewConversationDialog";

/**
 * Bandeja + conversación — «Sidebar y Chats» del manual de marca v1.0.
 * La lista es de 360px fijos; el hilo se queda con el resto.
 * En móvil se ve una cosa u otra: la lista, o la conversación abierta.
 */
export const ChatPage = () => {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isNewOpen, setIsNewOpen] = useState(false);

    // ESC cierra el chat abierto
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setSelectedId(null);
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    return (
        <div className="bg-brand-bg h-full w-full flex flex-row overflow-hidden min-h-0">
            <div className={`h-full min-w-0 overflow-hidden border-r border-brand-border
                w-full md:w-[360px] md:flex-none ${selectedId ? 'hidden md:block' : 'block'}`}>
                <ChatconversationList
                    onSelect={setSelectedId}
                    selectedId={selectedId}
                    onNewConversation={() => setIsNewOpen(true)}
                />
            </div>

            <div className={`h-full flex-1 min-w-0 ${selectedId ? 'block' : 'hidden md:block'}`}>
                <ChatThread conversationId={selectedId} onBack={() => setSelectedId(null)} />
            </div>

            <NewConversationDialog
                open={isNewOpen}
                onClose={() => setIsNewOpen(false)}
                onCreated={setSelectedId}
            />
        </div>
    );
};
