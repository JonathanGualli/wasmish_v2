import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sendMessage } from "../services/api.service";

export const useSendMessage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, text }: { conversationId: string; text: string }) =>
      sendMessage(conversationId, text),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["conversation", variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};
