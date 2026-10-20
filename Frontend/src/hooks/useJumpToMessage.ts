import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { Message } from "../models/message.mode";

type MessagesPage = { items: Message[]; nextCursor: string | undefined };

/** Hasta dónde se busca un original hacia atrás: 10 páginas de 20 (decisión de Jonathan, spec § 10). */
const MAX_PAGES = 10;
/** Lo que dura el halo sobre el original encontrado (el diseño: 1,5 s). */
const HIGHLIGHT_MS = 1500;

/**
 * Ir al mensaje que cita otro (tocar la cita). Si está en la caché, lo hace
 * visible y lo resalta un momento; si no, va pidiendo páginas más antiguas
 * hasta encontrarlo, como mucho `MAX_PAGES`, y si no aparece llama a
 * `onTooOld`. Mientras busca, `searching`; `cancel()` lo para.
 *
 * Los mensajes se encuentran en el DOM por `data-message-id`.
 */
export const useJumpToMessage = (
    conversationId: string,
    { fetchNextPage, onTooOld }: { fetchNextPage: () => Promise<unknown>; onTooOld: () => void },
) => {
    const queryClient = useQueryClient();
    const [searching, setSearching] = useState(false);
    const [highlightedId, setHighlightedId] = useState<string | null>(null);
    const run = useRef(0);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        run.current++;
        if (timer.current) clearTimeout(timer.current);
    }, [conversationId]);

    const pages = useCallback(
        () => queryClient.getQueryData<InfiniteData<MessagesPage>>(["conversation", conversationId]),
        [queryClient, conversationId],
    );

    const reveal = useCallback((messageId: string) => {
        // Tras el render que pinta las páginas recién llegadas.
        requestAnimationFrame(() => {
            document.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`)
                ?.scrollIntoView({ block: "center", behavior: "smooth" });
        });
        setHighlightedId(messageId);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setHighlightedId(current => (current === messageId ? null : current)), HIGHLIGHT_MS);
    }, []);

    const jumpTo = useCallback(async (messageId: string) => {
        const mine = ++run.current;
        const has = () => pages()?.pages.some(page => page.items.some(msg => msg.id === messageId)) ?? false;
        if (has()) return reveal(messageId);

        setSearching(true);
        try {
            for (let loaded = pages()?.pages.length ?? 0; loaded < MAX_PAGES; loaded++) {
                const data = pages();
                if (!data?.pages.at(-1)?.nextCursor) break;
                await fetchNextPage();
                if (run.current !== mine) return;
                if (has()) return reveal(messageId);
            }
            if (run.current === mine) onTooOld();
        } finally {
            if (run.current === mine) setSearching(false);
        }
    }, [pages, fetchNextPage, reveal, onTooOld]);

    const cancel = useCallback(() => {
        run.current++;
        setSearching(false);
    }, []);

    return { jumpTo, searching, cancel, highlightedId };
};
