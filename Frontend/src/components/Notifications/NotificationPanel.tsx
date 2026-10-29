import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";
import { useNotifications, useOpenNotification } from "../../hooks/useNotifications";
import { useOnVisible } from "../../hooks/useOnVisible";
import type { AppNotification } from "../../models/notification.model";
import { SkeletonListRow } from "../Skeleton/SkeletonListRow";
import { NotificationItem } from "./NotificationItem";

interface Props {
    onClose: () => void;
    /** Pantalla completa (celular, m2) o el panel que sale de la barra (computadora, 5a). */
    fullScreen: boolean;
    /** Computadora: dónde empieza el panel, a la derecha de la campanita. */
    left?: number;
}

/**
 * Los avisos de quien mira: «Avisos», cuántos quedan sin ver, «Marcar todos
 * como vistos» y la lista, que carga los anteriores al llegar al final. Al
 * abrirse vuelve a leer la lista. Se cierra al pulsar fuera, con Esc o al abrir
 * una conversación.
 */
export const NotificationPanel = ({ onClose, fullScreen, left = 84 }: Props) => {
    const { items, unseenCount, hasMore, loadMore, isLoading, isError, isFetchingMore, markSeen, markAllSeen, refresh } = useNotifications();
    const openConversation = useOpenNotification();
    const sentinel = useOnVisible<HTMLDivElement>(loadMore, Boolean(hasMore) && !isFetchingMore);

    // Al abrirlo, lo último: lo que cambió mientras estaba cerrado puede no haber llegado por el SSE.
    useEffect(() => { void refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    const open = (notification: AppNotification) => {
        if (!notification.seen) markSeen([notification.id]);
        if (!notification.conversation?.canOpen) return;
        openConversation(notification);
        onClose();
    };

    const header = (
        <div className="flex-none flex items-center gap-2.5 px-[18px] max-md:px-4 pt-4 pb-3.5 max-md:py-3 border-b border-brand-raised">
            {!fullScreen && <span className="text-[17px] font-bold tracking-[-0.015em] text-brand-text">Avisos</span>}
            {unseenCount > 0 && <span className="text-[13px] max-md:text-sm text-brand-muted">{unseenCount} sin ver</span>}
            {unseenCount > 0 && (
                <button type="button" onClick={() => void markAllSeen()}
                    className="ml-auto text-[13px] max-md:text-sm font-semibold text-brand-accent-strong hover:underline cursor-pointer max-md:py-2">
                    Marcar todos como vistos
                </button>
            )}
        </div>
    );

    const body = (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            {isLoading ? (
                [0, 1, 2, 3].map(index => (
                    <SkeletonListRow key={index} index={index} avatar="w-8 h-8 rounded-lg" className="px-[18px] py-3.5 border-b border-brand-bg" />
                ))
            ) : isError && items.length === 0 ? (
                <div className="px-8 py-11 text-center text-sm text-brand-danger">No se pudieron cargar los avisos.</div>
            ) : items.length === 0 ? (
                <div className="px-8 py-11 text-center grid gap-1.5">
                    <span className="text-sm font-semibold text-brand-strong">No tienes avisos</span>
                    <span className="text-[13px] leading-normal text-brand-muted">Aquí te esperan las conversaciones que te asignen o que te pidan.</span>
                </div>
            ) : (
                <>
                    {items.map(notification => (
                        <NotificationItem key={notification.id} notification={notification} onOpen={open} markSeen={markSeen} refresh={refresh} />
                    ))}
                    <div ref={sentinel} className="h-px" />
                    {isFetchingMore && (
                        <SkeletonListRow index={items.length} avatar="w-8 h-8 rounded-lg" className="px-[18px] py-3.5" />
                    )}
                </>
            )}
        </div>
    );

    if (fullScreen) {
        return createPortal(
            <div role="dialog" aria-label="Avisos"
                className="fixed inset-0 z-[55] bg-brand-surface flex flex-col pt-[var(--safe-top)] pb-[var(--safe-bottom)]">
                <div className="flex-none h-14 flex items-center gap-2 px-2 border-b border-brand-border">
                    <button type="button" onClick={onClose} title="Volver"
                        className="w-10 h-10 flex items-center justify-center rounded-lg text-brand-strong hover:bg-brand-bg cursor-pointer transition-colors">
                        <ChevronLeft size={22} />
                    </button>
                    <span className="text-[17px] font-bold text-brand-text">Avisos</span>
                </div>
                {header}
                {body}
            </div>,
            document.body,
        );
    }

    return createPortal(
        <>
            {/* Capa invisible: pulsar fuera lo cierra. */}
            <div className="fixed inset-0 z-[54]" onClick={onClose} />
            <div role="dialog" aria-label="Avisos" style={{ left }}
                className="fixed z-[55] bottom-[14px] w-[410px] max-h-[min(660px,calc(100dvh-28px))] flex flex-col bg-brand-surface
                    border border-brand-border rounded-[14px] shadow-[0_24px_60px_rgba(14,17,22,0.2)] overflow-hidden">
                {header}
                {body}
            </div>
        </>,
        document.body,
    );
};
