import { useNavigate, useParams } from "react-router-dom";
import { ConversationList } from "../../../components/Chat/ConversationList.tsx";
import { ChatThread } from "../../../components/Chat/ChatThread.tsx";

export const ChatPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const handleSelect = (conversationId: string) => {
    navigate(`/private/chats/${conversationId}`);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100vh-3.5rem-2rem)]">
      <div className="md:col-span-1 border rounded bg-white overflow-hidden">
        <ConversationList selectedId={id || ""} onSelect={handleSelect} />
      </div>
      <div className="md:col-span-2 border rounded bg-white h-full">
        {id ? (
          <ChatThread conversationId={id} />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            Selecciona una conversación
          </div>
        )}
      </div>
    </div>
  );
};
