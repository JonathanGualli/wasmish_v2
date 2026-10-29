import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { useAuthContext } from "../context/auth.context";
import { useSSE } from "../context/sse.context";
import { useNotice } from "../components/Notice/context/useNotice";
import { getNotificationsService, markNotificationsSeenService } from "../services/api.service";
import type { AppNotification, NotificationsPage } from "../models/notification.model";
import type { ChatsNavigationState } from "../models/conversation.mode";
import { ChatsPath } from "../models/routes.models";
import { hasTeam } from "../utils/roleDisplay";
import { notificationToast } from "../utils/assignment";
import { resetTransferState } from "./useTransferRequest";

// ---------------------------------------------------------------------------
// Los avisos de la campanita (avisos de la asignación, spec § 8.3). La lista va
// en `['notifications']`, por páginas de 30; el número de sin ver, aparte, en
// `['notifications', 'unseen']`: lo fijan las respuestas, los SSE y marcar
// visto, y nunca se pide solo. Las operaciones sobre la lista van con
// `exact: true` para no arrastrar el contador.
// ---------------------------------------------------------------------------

const LIST_KEY = ['notifications'] as const;
const UNSEEN_KEY = ['notifications', 'unseen'] as const;
type NotificationsData = InfiniteData<NotificationsPage, string | undefined>;

/**
 * Sube con cada cambio del contador que no es una lectura (un SSE, marcar
 * visto). Una lectura solo fija el contador si nada lo movió mientras iba en
 * camino: si no, un `GET` que salió antes de un aviso nuevo lo devolvería al
 * número de antes (revisión de Codex del plan, 12).
 */
let unseenVersion = 0;
const setUnseen = (queryClient: QueryClient, count: number) => {
    unseenVersion += 1;
    queryClient.setQueryData<number>(UNSEEN_KEY, Math.max(0, count));
};

const mapItems = (data: NotificationsData, update: (items: AppNotification[]) => AppNotification[]): NotificationsData => ({
    ...data,
    pages: data.pages.map(page => ({ ...page, items: update(page.items) })),
});

/**
 * Aplica un cambio a la lista sin que una lectura en camino lo deshaga, como
 * `applyToList` en `useConversations`: se cancela, se aplica y, si se canceló
 * algo (la carga, el refresco o «cargar más»), se vuelve a pedir, ya con él.
 */
const applyToNotifications = async (queryClient: QueryClient, update: (data: NotificationsData) => NotificationsData) => {
    const wasFetching = queryClient.isFetching({ queryKey: LIST_KEY, exact: true }) > 0;
    await queryClient.cancelQueries({ queryKey: LIST_KEY, exact: true });
    queryClient.setQueryData<NotificationsData>(LIST_KEY, old => (old ? update(old) : old));
    if (wasFetching) void queryClient.invalidateQueries({ queryKey: LIST_KEY, exact: true });
};

const refreshNotifications = (queryClient: QueryClient) =>
    queryClient.invalidateQueries({ queryKey: LIST_KEY, exact: true });

/**
 * Marca vistos (`ids`) o todos (`all`): al momento en la lista y el contador, y
 * luego lo que diga el servidor. Si falla, se vuelve a leer la lista.
 */
const markSeenInCache = async (queryClient: QueryClient, target: { ids: string[] } | { all: true }) => {
    const pick = (item: AppNotification) => ('all' in target || target.ids.includes(item.id));
    const cached = queryClient.getQueryData<NotificationsData>(LIST_KEY)?.pages.flatMap(page => page.items) ?? [];
    const fresh = cached.filter(item => pick(item) && !item.seen).length;
    // Todos los que se piden están en la lista y ya vistos: no hay nada que hacer.
    if ('ids' in target && fresh === 0 && target.ids.every(id => cached.some(item => item.id === id))) return;
    const unseen = queryClient.getQueryData<number>(UNSEEN_KEY) ?? 0;
    setUnseen(queryClient, 'all' in target ? 0 : unseen - fresh);
    const version = unseenVersion;
    void applyToNotifications(queryClient, data =>
        mapItems(data, list => list.map(item => (pick(item) ? { ...item, seen: true } : item))));
    try {
        const result = await markNotificationsSeenService(target);
        // Si mientras tanto llegó un aviso nuevo (u otro cambio), su número manda: la
        // respuesta lo devolvería al de antes (revisión de Codex del PR #157). El de
        // esta respuesta no se pierde: llega también por `notifications_seen`.
        if (version === unseenVersion) setUnseen(queryClient, result.unseenCount);
    } catch {
        void refreshNotifications(queryClient);
    }
};

/**
 * La campanita: la lista (que carga los anteriores al bajar), cuántos quedan
 * sin ver y marcarlos. Solo con equipo: con una persona no hay avisos y la
 * campanita no se pinta. Los SSE los atiende `useNotificationToasts`, una vez.
 */
export const useNotifications = () => {
    const queryClient = useQueryClient();
    const { user } = useAuthContext();
    const enabled = hasTeam(user);

    const list = useInfiniteQuery({
        queryKey: LIST_KEY,
        queryFn: async ({ pageParam }) => {
            const version = unseenVersion;
            const page = await getNotificationsService(pageParam);
            if (version === unseenVersion) queryClient.setQueryData<number>(UNSEEN_KEY, page.unseenCount);
            return page;
        },
        initialPageParam: undefined as string | undefined,
        getNextPageParam: last => last.nextCursor ?? undefined,
        enabled,
    });
    // Sin `queryFn` propia: el número lo traen las lecturas de la lista.
    const unseen = useQuery({ queryKey: UNSEEN_KEY, queryFn: () => 0, enabled: false });

    const items = list.data?.pages.flatMap(page => page.items) ?? [];
    const unseenCount = unseen.data ?? 0;

    return {
        enabled,
        items,
        unseenCount,
        hasMore: list.hasNextPage,
        loadMore: () => { if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage(); },
        isLoading: list.isLoading,
        isError: list.isError,
        isFetchingMore: list.isFetchingNextPage,
        markSeen: (ids: string[]) => markSeenInCache(queryClient, { ids }),
        markAllSeen: () => markSeenInCache(queryClient, { all: true }),
        refresh: () => refreshNotifications(queryClient),
    };
};

/** Abrir la conversación de un aviso, como el aviso de un mensaje: la bandeja la abre. */
export const useOpenNotification = () => {
    const navigate = useNavigate();
    const { user } = useAuthContext();
    const userId = user?.id ?? '';
    return useCallback((notification: AppNotification) => {
        if (!notification.conversation?.canOpen) return;
        if (notification.type === 'passed' || notification.type === 'rejected') {
            resetTransferState(userId, notification.conversation.id);
        }
        navigate(ChatsPath, { state: { conversationId: notification.conversation.id } satisfies ChatsNavigationState });
    }, [navigate, userId]);
};

/**
 * Los avisos en vivo, en cualquier página: la campanita al día con los cuatro
 * SSE y, con cada aviso nuevo, el aviso de arriba con «Abrir» (diseño 7a). Se
 * monta una vez, en el layout privado, junto a `useTransferAnswers`.
 */
export const useNotificationToasts = () => {
    const queryClient = useQueryClient();
    const { subscribe } = useSSE();
    const { notify } = useNotice();
    const open = useOpenNotification();

    useEffect(() => {
        const unsubCreated = subscribe("notification_created", ({ notification, unseenCount }) => {
            setUnseen(queryClient, unseenCount);
            void applyToNotifications(queryClient, (data) => {
                if (data.pages.some(page => page.items.some(item => item.id === notification.id))) return data;
                const [first, ...rest] = data.pages;
                return { ...data, pages: [{ ...first, items: [notification, ...first.items] }, ...rest] };
            });
            const { kind, text } = notificationToast(notification);
            const canOpen = Boolean(notification.conversation?.canOpen) && notification.type !== 'rejected';
            notify(canOpen
                ? {
                    kind, text, action: {
                        label: 'Abrir',
                        onClick: () => {
                            void markSeenInCache(queryClient, { ids: [notification.id] });
                            open(notification);
                        },
                    },
                }
                : { kind, text });
        });
        // Una solicitud se resolvió: el aviso pierde los botones y dice cómo terminó.
        const unsubUpdated = subscribe("notification_updated", ({ notification }) => {
            void applyToNotifications(queryClient, data =>
                mapItems(data, list => list.map(item => (item.id === notification.id ? notification : item))));
        });
        // Vistos en otra pestaña o dispositivo.
        const unsubSeen = subscribe("notifications_seen", ({ unseenCount }) => {
            setUnseen(queryClient, unseenCount);
            void refreshNotifications(queryClient);
        });
        // Cambió quién atiende algo: puede cambiar qué avisos se pueden abrir o responder.
        const refresh = () => { void refreshNotifications(queryClient); };
        const unsubAssigned = subscribe("conversation_assigned", refresh);
        const unsubRevoked = subscribe("conversation_revoked", refresh);
        const unsubReleased = subscribe("conversations_updated", refresh);

        return () => {
            unsubCreated();
            unsubUpdated();
            unsubSeen();
            unsubAssigned();
            unsubRevoked();
            unsubReleased();
        };
    }, [subscribe, queryClient, notify, open]);
};
