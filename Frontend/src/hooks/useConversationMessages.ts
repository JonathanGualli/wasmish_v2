import { useQuery } from "@tanstack/react-query";
import { getMessages } from "../services/chat.service.ts";
import type { Message } from "../models/message.mode";

export const useConversationMessages = (conversationId: string) => {
  return useQuery<Message[]>({
    queryKey: ["conversation", conversationId],
    queryFn: () => getMessages(conversationId),
    enabled: !!conversationId,
  });
};
