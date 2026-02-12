import { useState } from "react";
import { useConversations } from "../../hooks/useConversations";

interface Props {
    onSelect: (id: string) => void;
}

export const ChatconversationList = ({ onSelect }: Props) => {

    const { data: conversations, isLoading, isError } = useConversations();

    const [selectedId, setSelectedId] = useState<string | null>(null);

    if (isLoading) return <div className="flex items-center justify-center h-full text-gray-500 bg-white">Cargando conversaciones...</div>

    if (isError) return <div className="flex items-center justify-center h-full text-red-500 bg-white">¡Error al cargar las conversaciones!</div>

    if(!conversations || conversations.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-gray-500 bg-white">
                No hay conversaciones disponibles.
            </div>
        );
    }

    return (
        <div className="bg-gray-100 h-full w-full flex flex-col border">
            {conversations?.map((chat) => (
                <div key={chat.id}
                    onClick={() => {
                        setSelectedId(chat.id); 
                        onSelect(chat.id);
                    }}
                    className={`p-4 border-b border-gray-300  
                              ${selectedId !== chat.id ? 'hover:bg-gray-200' : '' } cursor-pointer transition-colors duration-150
                              ${selectedId === chat.id ? 'bg-blue-200' : ''}`}>

                    <div className="flex justify-between items-center">
                        <h1 className="font-semibold text-black">
                            {chat.title || chat.phone}
                        </h1>
                        <span className="text-xs text-gray-500">
                            {new Date(chat.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>

                    <h3 className="text-gray-600 text-sm truncate">
                        {chat.lastMessage || "Sin mensajes aún"}
                    </h3>

                    {chat.unreadCount > 0 && (
                        <span className="mt-1 inline-block bg-blue-500 text-white text-xs rounded-full px-2 py-0.5">
                            {chat.unreadCount}
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}
