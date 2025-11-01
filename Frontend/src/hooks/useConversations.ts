import { useQuery } from "@tanstack/react-query";
import { getConversations } from "../services/chat.service.ts";
import type { Conversation } from "../models/conversation.mode.ts";

export const useConversations = () => {
  return useQuery<Conversation[]>({
    queryKey: ["conversations"],
    queryFn: getConversations,
  });
};
