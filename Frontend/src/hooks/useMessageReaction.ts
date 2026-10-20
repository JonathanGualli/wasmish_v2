import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { setReactionService } from "../services/api.service";
import type { Message, OwnReaction } from "../models/message.mode";
import { useAuthContext } from "../context/auth.context";
import { reactionErrorText } from "../utils/whatsappErrors";

type MessagesPage = { items: Message[]; nextCursor: string | undefined };
type ErrorItem = { message: string; code?: string; errorCode?: string | null; errorDetail?: string | null };

/** Por qué no salió, en palabras: lo de Meta con su traducción; lo nuestro, tal cual. */
const reasonOf = (error: unknown) => {
    const item = (error as AxiosError<ErrorItem[]>).response?.data?.[0];
    if (!item) return "No se pudo conectar con el servidor.";
    if (item.code === "reaction_in_progress") return "Alguien de tu equipo está reaccionando a este mensaje.";
    if (item.errorCode || item.errorDetail) return reactionErrorText(item.errorCode, item.errorDetail);
    return item.message;
};

/**
 * Reaccionar a los mensajes de una conversación, con UI optimista: la reacción
 * aparece al momento (atenuada mientras va) y, si el servidor la rechaza,
 * vuelve la de antes con el aviso del motivo. Si WhatsApp la rechaza más
 * tarde, llega por el SSE (`message_updated`) como fallida.
 *
 * Tocar el emoji que ya está lo quita. Mientras una va en camino, ese mensaje
 * no admite otra (el backend respondería 409). `onRejected(motivo)`: el aviso
 * de que no salió, que pinta quien lo usa.
 */
export const useMessageReaction = (conversationId: string, onRejected: (reason: string) => void) => {
    const queryClient = useQueryClient();
    const { user } = useAuthContext();
    const key = ["conversation", conversationId];

    // Nunca mutar la caché: cada página y el mensaje que cambia, objetos nuevos.
    const patch = (messageId: string, update: (msg: Message) => Message) =>
        queryClient.setQueryData<InfiniteData<MessagesPage>>(key, old => old && {
            ...old,
            pages: old.pages.map(page => ({ ...page, items: page.items.map(msg => (msg.id === messageId ? update(msg) : msg)) })),
        });

    const setOwn = (messageId: string, me: OwnReaction | null) =>
        patch(messageId, msg => ({ ...msg, reactions: { them: msg.reactions?.them ?? null, me } }));

    const mutation = useMutation({
        mutationFn: ({ message, emoji }: { message: Message; emoji: string }) =>
            setReactionService(conversationId, message.id, emoji),

        onMutate: async ({ message, emoji }) => {
            await queryClient.cancelQueries({ queryKey: key });
            const previous = message.reactions?.me ?? null;
            setOwn(message.id, emoji ? {
                emoji,
                previousEmoji: previous?.emoji ?? null,
                at: new Date().toISOString(),
                status: "sent",
                errorCode: null,
                errorDetail: null,
                sentBy: user ? { id: user.id, name: user.name } : null,
                origin: "chat",
                pending: true,
            } : null);
            return { previous };
        },

        onError: (error, { message }, context) => {
            setOwn(message.id, context?.previous ?? null);
            onRejected(reasonOf(error));
        },

        // Lo del servidor, salvo que el SSE ya haya traído algo más nuevo.
        onSuccess: (server) => patch(server.id, msg =>
            (server.changeVersion ?? 0) >= (msg.changeVersion ?? 0) ? { ...msg, ...server } : msg),
    });

    const react = (message: Message, emoji: string) => {
        const mine = message.reactions?.me;
        if (mine?.pending) return;
        const sameAsNow = mine && mine.status !== "failed" && mine.emoji === emoji;
        mutation.mutate({ message, emoji: sameAsNow ? "" : emoji });
    };

    return { react };
};
