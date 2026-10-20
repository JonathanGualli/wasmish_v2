import { useEffect, useRef } from "react";
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
 * Tocar el emoji que ya está lo quita. Mientras una va en camino (también
 * la que quita), ese mensaje no admite otra: el backend respondería 409 y los
 * deshacer se cruzarían. `onRejected(motivo)`: el aviso de que no salió, que
 * pinta quien lo usa, solo si sigue en esa conversación.
 *
 * La conversación va con cada petición, no en los callbacks: React Query los
 * cambia por los del render actual, y con otro chat abierto la respuesta
 * acababa en la caché equivocada (revisión de Codex del PR #117).
 */
export const useMessageReaction = (conversationId: string, onRejected: (reason: string) => void) => {
    const queryClient = useQueryClient();
    const { user } = useAuthContext();
    const current = useRef(conversationId);
    useEffect(() => { current.current = conversationId; }, [conversationId]);
    // Los mensajes con una reacción en camino, de cualquier conversación.
    const inFlight = useRef(new Set<string>());

    // Nunca mutar la caché: cada página y el mensaje que cambia, objetos nuevos.
    const patch = (chatId: string, messageId: string, update: (msg: Message) => Message) =>
        queryClient.setQueryData<InfiniteData<MessagesPage>>(["conversation", chatId], old => old && {
            ...old,
            pages: old.pages.map(page => ({ ...page, items: page.items.map(msg => (msg.id === messageId ? update(msg) : msg)) })),
        });

    const withOwn = (msg: Message, me: OwnReaction | null): Message =>
        ({ ...msg, reactions: { them: msg.reactions?.them ?? null, me } });

    type Variables = { chatId: string; message: Message; emoji: string };

    const mutation = useMutation({
        mutationFn: ({ chatId, message, emoji }: Variables) => setReactionService(chatId, message.id, emoji),

        onMutate: async ({ chatId, message, emoji }) => {
            await queryClient.cancelQueries({ queryKey: ["conversation", chatId] });
            const previous = message.reactions?.me ?? null;
            const optimistic: OwnReaction | null = emoji ? {
                emoji,
                previousEmoji: previous?.emoji ?? null,
                at: new Date().toISOString(),
                status: "sent",
                errorCode: null,
                errorDetail: null,
                sentBy: user ? { id: user.id, name: user.name } : null,
                origin: "chat",
                pending: true,
            } : null;
            patch(chatId, message.id, msg => withOwn(msg, optimistic));
            return { previous, version: message.changeVersion ?? 0 };
        },

        // Se deshace solo si nada lo cambió entretanto: una reacción que
        // llegó por el SSE es más nueva que la de antes (revisión de Codex del PR #117).
        onError: (error, { chatId, message }, context) => {
            if (context) {
                patch(chatId, message.id, msg =>
                    (msg.changeVersion ?? 0) === context.version ? withOwn(msg, context.previous) : msg);
            }
            if (current.current === chatId) onRejected(reasonOf(error));
        },

        // Lo del servidor, salvo que el SSE ya haya traído algo más nuevo.
        onSuccess: (server, { chatId }) => patch(chatId, server.id, msg =>
            (server.changeVersion ?? 0) >= (msg.changeVersion ?? 0) ? { ...msg, ...server } : msg),

        onSettled: (_data, _error, { message }) => { inFlight.current.delete(message.id); },
    });

    const react = (message: Message, emoji: string) => {
        if (!conversationId || inFlight.current.has(message.id)) return;
        const mine = message.reactions?.me;
        const sameAsNow = mine && mine.status !== "failed" && mine.emoji === emoji;
        inFlight.current.add(message.id);
        mutation.mutate({ chatId: conversationId, message, emoji: sameAsNow ? "" : emoji });
    };

    return { react };
};
