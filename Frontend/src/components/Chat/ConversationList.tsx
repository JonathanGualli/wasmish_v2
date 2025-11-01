import { useMemo } from "react";
import { useConversations } from "../../hooks/useConversations.ts";
import type { Conversation } from "../../models/conversation.mode.ts";

interface Props {
  selectedId?: string;
  onSelect: (id: string) => void;
}

export const ConversationList = ({ selectedId, onSelect }: Props) => {
  const { data, isLoading, isError } = useConversations();

  const sorted: Conversation[] = useMemo(
    () => [...(data ?? [])].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).reverse(),
    [data]
  );

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <div className="h-8 bg-gray-100 animate-pulse rounded" />
        <div className="h-8 bg-gray-100 animate-pulse rounded" />
        <div className="h-8 bg-gray-100 animate-pulse rounded" />
      </div>
    );
  }

  if (isError) {
    return <div className="p-4 text-red-500">Error cargando conversaciones</div>;
  }

  if (sorted.length === 0) {
    return <div className="p-4 text-gray-500">No hay conversaciones</div>;
  }

  return (
    <ul className="divide-y">
      {sorted.map((c: Conversation) => {
        const isActive = c.id === selectedId;
        return (
          <li
            key={c.id}
            className={`p-3 cursor-pointer hover:bg-gray-50 ${
              isActive ? "bg-gray-100" : ""
            }`}
            onClick={() => onSelect(c.id)}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{c.title}</div>
                <div className="text-xs text-gray-500">{c.phone}</div>
              </div>
              <div className="text-xs text-gray-500">
                {new Date(c.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
            <div className="text-sm text-gray-600 truncate">{c.lastMessage}</div>
            {c.unreadCount > 0 && (
              <span className="mt-1 inline-flex items-center justify-center text-xs bg-blue-600 text-white rounded-full px-2">
                {c.unreadCount}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
};
