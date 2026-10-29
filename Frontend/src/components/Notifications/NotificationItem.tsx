import { useAuthContext } from "../../context/auth.context";
import { useNotice } from "../Notice/context/useNotice";
import { assignmentError, useConversationAssignment } from "../../hooks/useConversationAssignment";
import type { AppNotification } from "../../models/notification.model";
import { notificationText } from "../../utils/assignment";
import { formatChatTime } from "../../utils/formatChatTime";
import { initials } from "../../utils/initials";
import { LineChip } from "../Line/LineChip";

interface Props {
    notification: AppNotification;
    /** Tocarlo: la campanita lo marca visto y, si se puede, abre su conversación. */
    onOpen: (notification: AppNotification) => void;
    markSeen: (ids: string[]) => void;
    refresh: () => void;
}

/**
 * Un aviso de la campanita (diseño «Avisos de la asignación», 5a y m2): quién y
 * qué, el contacto, su línea y la hora, y la nota de cómo terminó. Sin ver, con
 * fondo verde claro y punto; si ya no se puede abrir, en gris. Una solicitud que
 * quien mira puede responder lleva sus dos botones.
 */
export const NotificationItem = ({ notification, onOpen, markSeen, refresh }: Props) => {
    const { user } = useAuthContext();
    const { notify } = useNotice();
    const { who, rest, note } = notificationText(notification, user?.id ?? '');
    const { conversation, request } = notification;
    const canOpen = Boolean(conversation?.canOpen);
    const { answer } = useConversationAssignment(conversation?.id ?? '');

    const respond = (accept: boolean) => {
        if (!request) return;
        markSeen([notification.id]);
        answer.mutate({ requestId: request.requestId, accept }, {
            onError: (error) => {
                const { code, message } = assignmentError(error);
                // Otro la resolvió o cambió de manos antes: se vuelve a leer y se avisa.
                if (code === 'transfer_request_changed' || code === 'assignment_changed') {
                    notify({ kind: 'info', text: 'La solicitud cambió. Revísala de nuevo.' });
                    refresh();
                    return;
                }
                notify({ kind: 'error', text: message });
            },
        });
    };
    const showActions = notification.type === 'requested' && request?.pending && request.canAnswer;

    return (
        <div
            role={canOpen ? 'button' : undefined}
            tabIndex={canOpen ? 0 : undefined}
            onClick={() => onOpen(notification)}
            // Solo la fila: Enter o Espacio en «Rechazar» o «Pasársela» no la abren (revisión de Codex del PR #157).
            onKeyDown={(event) => {
                if (event.target !== event.currentTarget || !canOpen) return;
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(notification); }
            }}
            className={`relative flex gap-3 px-[18px] max-md:px-4 py-3.5 max-md:py-4 border-b border-brand-bg transition-colors
                ${notification.seen ? 'bg-brand-surface' : 'bg-brand-green-50'}
                ${canOpen ? 'cursor-pointer hover:bg-brand-bg' : 'cursor-default'}`}
        >
            <span className={`flex-none w-8 h-8 max-md:w-[38px] max-md:h-[38px] rounded-lg max-md:rounded-[10px] bg-brand-border text-brand-strong
                text-[11px] max-md:text-xs font-bold flex items-center justify-center ${canOpen ? '' : 'opacity-[0.62]'}`}>
                {initials(notification.actor?.name ?? '')}
            </span>

            <div className={`flex-1 min-w-0 grid gap-1 ${canOpen ? '' : 'opacity-[0.62]'}`}>
                <div className="text-[13.5px] max-md:text-[15px] leading-[1.4] text-brand-strong pr-3.5">
                    <b className="font-semibold text-brand-text">{who}</b> {rest}
                </div>
                <div className="flex items-center gap-[7px] min-w-0 text-[12.5px] max-md:text-[13.5px] text-brand-gray-600">
                    {conversation && (
                        <span className="font-semibold text-brand-text truncate min-w-0">{conversation.title}</span>
                    )}
                    <span className="flex empty:hidden"><LineChip lineId={conversation?.lineId} /></span>
                    {conversation && <span className="flex-none text-brand-subtle">·</span>}
                    <span className="flex-none font-mono tabular-nums text-[11px] max-md:text-xs text-brand-muted">
                        {formatChatTime(notification.createdAt)}
                    </span>
                </div>
                {note && <div className="text-[12.5px] max-md:text-[13.5px] text-brand-muted">{note}</div>}
                {showActions && (
                    <div className="flex flex-wrap gap-2 mt-1.5">
                        <button
                            type="button"
                            disabled={answer.isPending}
                            onClick={(event) => { event.stopPropagation(); respond(false); }}
                            className="h-8 max-md:h-10 px-3 rounded-lg border border-brand-border-strong bg-brand-surface text-[13px] font-semibold
                                text-brand-strong hover:bg-brand-bg transition-colors cursor-pointer disabled:cursor-default disabled:text-brand-subtle"
                        >
                            Rechazar
                        </button>
                        <button
                            type="button"
                            disabled={answer.isPending}
                            onClick={(event) => { event.stopPropagation(); respond(true); }}
                            className="h-8 max-md:h-10 px-3 rounded-lg bg-brand-accent hover:bg-brand-accent-hover text-[13px] font-semibold
                                text-brand-ink transition-colors cursor-pointer disabled:cursor-default disabled:bg-brand-raised disabled:text-brand-subtle"
                        >
                            Pasársela a {who}
                        </button>
                    </div>
                )}
            </div>

            {!notification.seen && (
                <span aria-label="Sin ver" className="absolute top-[19px] max-md:top-[22px] right-[18px] max-md:right-4 w-2 h-2 rounded-full bg-brand-green-500" />
            )}
        </div>
    );
};
