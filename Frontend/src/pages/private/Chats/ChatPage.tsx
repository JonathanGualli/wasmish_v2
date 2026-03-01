import { useState } from "react";
import { ChatThread } from "../../../components/Chat/ChatThread";
import { ChatconversationList } from "../../../components/Chat/ConversationList";

export const ChatPage = () => {

    const [selectedId, setSelectedId] = useState<string | null>(null);

    return (
        <>
         <div className="bg-gray-300 h-full w-full flex flex-row p-4">
             <div className="basis-1/3 h-full min-w-0 overflow-hidden">
                <ChatconversationList onSelect={setSelectedId}/>
            </div> 
            <div className="basis-2/3 h-full">
                <ChatThread conversationId={selectedId} />
            </div>
         </div>
        </>
    );
}