import type { TransferRequest } from "../../../models/conversation.mode";
import { firstName } from "../../../utils/assignment";
import { formatTimeAgo } from "../../../utils/formatChatTime";
import { PersonBadge } from "./PersonBadge";

/**
 * La solicitud de que le pasen la conversación a alguien (diseño, 1a y m2), a
 * quien puede responderla: la persona que la atiende («pide que se la pases»)
 * o quien supervisa («pide que le pasen esta conversación»).
 */
export const TransferRequestBar = ({ request, isMine, busy, onAccept, onReject }: {
    request: TransferRequest;
    /** La atiende quien mira. */
    isMine: boolean;
    busy: boolean;
    onAccept: () => void;
    onReject: () => void;
}) => {
    const who = firstName(request.requestedBy);
    return (
        <div className="flex-none flex items-center max-md:grid gap-3 max-md:gap-2.5 px-6 max-md:px-4 py-2.5 max-md:py-3
            bg-brand-green-50 border-b border-brand-accent-soft">
            <span className="max-md:hidden"><PersonBadge name={request.requestedBy.name} size={28} /></span>
            <p className="flex-1 min-w-0 text-[13.5px] max-md:text-sm leading-[1.45] text-brand-strong">
                <b className="font-semibold text-brand-text">{who}</b>{' '}
                {isMine ? 'pide que se la pases' : 'pide que le pasen esta conversación'}{' '}
                <span className="font-mono text-[11.5px] max-md:text-xs text-brand-muted">
                    · {formatTimeAgo(Date.now() - new Date(request.requestedAt).getTime())}
                </span>
            </p>
            <div className="flex-none flex gap-2 max-md:grid max-md:grid-cols-2">
                <button type="button" onClick={onReject} disabled={busy}
                    className="h-[34px] max-md:h-11 px-[13px] rounded-[8px] max-md:rounded-[10px] border border-brand-border-strong
                        bg-brand-surface text-[13px] max-md:text-sm font-semibold text-brand-strong hover:bg-brand-bg
                        transition-colors cursor-pointer disabled:cursor-not-allowed disabled:text-brand-subtle">
                    Rechazar
                </button>
                <button type="button" onClick={onAccept} disabled={busy}
                    className="h-[34px] max-md:h-11 px-[13px] rounded-[8px] max-md:rounded-[10px] bg-brand-accent hover:bg-brand-accent-hover
                        text-[13px] max-md:text-sm font-semibold text-brand-ink transition-colors cursor-pointer
                        disabled:cursor-not-allowed disabled:bg-brand-raised disabled:text-brand-subtle">
                    <span className="max-md:hidden">Pasársela a {who}</span><span className="md:hidden">Pasársela</span>
                </button>
            </div>
        </div>
    );
};
