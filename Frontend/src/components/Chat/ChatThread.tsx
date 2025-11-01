import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useConversationMessages } from "../../hooks/useConversationMessages.ts";
import { useSendMessage } from "../../hooks/useSendMessage.ts";
import type { Message } from "../../models/message.mode.ts";

interface Props {
  conversationId: string;
}

export const ChatThread = ({ conversationId }: Props) => {
  const { data, isLoading, isError } = useConversationMessages(conversationId);
  const sendMutation = useSendMessage();
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    sendMutation.mutate({ conversationId, text }, { onSuccess: () => setText("") });
  };

  if (isLoading) return <div className="p-4">Cargando mensajes...</div>;
  if (isError) return <div className="p-4 text-red-500">Error cargando mensajes</div>;

  const messages: Message[] = data ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map((m: Message) => (
          <div key={m.id} className={`flex ${m.sender === "me" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[70%] rounded px-3 py-2 text-sm shadow ${
                m.sender === "me" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-800"
              }`}
            >
              <div>{m.text}</div>
              <div className="text-[10px] opacity-70 mt-1 text-right">
                {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={onSubmit} className="p-3 border-t flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-2 focus:outline-none focus:ring"
          placeholder="Escribe un mensaje"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="submit"
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
          disabled={sendMutation.isPending}
        >
          Enviar
        </button>
      </form>
    </div>
  );
};
