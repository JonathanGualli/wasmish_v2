import { useEffect, useState } from "react";
import { ChatThread } from "../../../components/Chat/ChatThread";
import { ChatconversationList } from "../../../components/Chat/ConversationList";

export const ChatPage = () => {

    const [selectedId, setSelectedId] = useState<string | null>(null);

    // ESC cierra el caht abierto
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setSelectedId(null);
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, []);

    return (
        <>
         <div className="bg-brand-bg h-full w-full flex flex-row overflow-hidden">
             <div className="basis-1/3 h-full min-w-0 overflow-hidden border-r border-brand-border">
                <ChatconversationList onSelect={setSelectedId} selectedId={selectedId} />
            </div>
            <div className="basis-2/3 h-full min-w-0">
                <ChatThread conversationId={selectedId} />
            </div>
         </div>
        </>
    );
}
