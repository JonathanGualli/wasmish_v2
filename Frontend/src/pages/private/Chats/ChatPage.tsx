import { ChatThread } from "../../../components/Chat/ChatThread";
import { ChatconversationList } from "../../../components/Chat/ConversationList";

export const ChatPage = () => {
    return (
        <>
         <div className="bg-gray-300 h-full w-full flex flex-row  p-4">
             <div className="basis-1/3 h-full">
                <ChatThread />
            </div> 
            <div className="basis-2/3 h-full">
            <ChatconversationList />
            </div>
         </div>
        </>
    );
}