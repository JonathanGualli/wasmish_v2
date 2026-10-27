import { useEffect, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { Conversation } from "../../../models/conversation.mode";
import { assignmentError, useConversationAssignment } from "../../../hooks/useConversationAssignment";
import { canReassignConversation, firstName } from "../../../utils/assignment";
import { ROLE_LABEL } from "../../../utils/roleDisplay";
import { lineLabel } from "../../../utils/lineDisplay";
import { useLines } from "../../../hooks/useLines";
import { PHONE_QUERY, useMediaQuery } from "../../../hooks/useMediaQuery";
import { PersonBadge, UnassignedBadge } from "./PersonBadge";
import { SkeletonBox, SkeletonLine } from "../../Skeleton/Skeleton";

interface Props {
    conversation: Conversation;
    userId: string;
    /** Tiene `conversations.assign`: puede mover cualquiera. */
    canAssignAny: boolean;
    /** Un aviso dentro del hilo («Ahora la atiende Ana.»). */
    onToast: (text: string) => void;
    /** Quien mira se la va a pasar a otra persona: la va a perder (antes de enviar, porque el SSE llega antes que la respuesta). */
    onHandOff: (toName: string | null) => void;
    /** Otra persona la movió antes: «La conversación cambió de manos» (diseño, 2c). */
    onChanged: () => void;
}

/**
 * Quién atiende la conversación, en la cabecera del chat (diseño, 1a y m2):
 * «Sin asignar» con «Tomar», o «Atiende · Ana». Quien puede moverla (con
 * `conversations.assign`, o el agente con la suya) abre la lista de quienes
 * pueden atender esa línea; en el celular, la lista sube desde abajo (m3).
 */
export const AssigneeControl = ({ conversation, userId, canAssignAny, onToast, onHandOff, onChanged }: Props) => {
    const [open, setOpen] = useState(false);
    const phone = useMediaQuery(PHONE_QUERY);
    const { lineById } = useLines();
    const { assignees, take, assign } = useConversationAssignment(conversation.id, { loadAssignees: open });
    const canOpen = canReassignConversation(conversation, userId, canAssignAny);
    const current = conversation.assignedTo ?? null;
    const isMine = current?.id === userId;
    const line = lineById(conversation.lineId);
    const busy = take.isPending || assign.isPending;

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            setOpen(false);
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [open]);

    const handleError = (error: unknown) => {
        const { code, message } = assignmentError(error);
        if (code === 'assignment_changed' || code === 'assigned_to_other') onChanged();
        else onToast(message);
    };

    const pick = (targetId: string | null, targetName: string | null) => {
        setOpen(false);
        if ((current?.id ?? null) === targetId) return;
        // El agente que la pasa a otra persona deja de verla.
        const losesIt = !canAssignAny && targetId !== null && targetId !== userId;
        if (losesIt) onHandOff(targetName);
        assign.mutate(targetId, {
            onSuccess: () => {
                if (losesIt) return;
                if (targetId === null) onToast('Ahora está sin asignar.');
                else if (targetId === userId) onToast('Ahora la atiendes tú.');
                else onToast(`Ahora la atiende ${firstName({ id: targetId, name: targetName })}.`);
            },
            onError: (error) => {
                if (losesIt) onHandOff(null);
                handleError(error);
            },
        });
    };

    const takeIt = () => take.mutate(undefined, {
        onSuccess: () => onToast('Ahora la atiendes tú.'),
        onError: handleError,
    });

    const options = [
        ...(assignees.data ?? []).map(person => ({
            key: person.id, name: person.name, label: person.name ?? 'Sin nombre', detail: ROLE_LABEL[person.role],
            isMe: person.id === userId, on: current?.id === person.id, id: person.id as string | null,
        })),
        { key: 'none', name: null, label: 'Sin asignar', detail: 'La puede tomar cualquiera de la línea', isMe: false, on: !current, id: null },
    ];

    const menu = (
        <>
            <div className={phone ? 'px-2 pb-2.5 grid gap-0.5' : 'px-2.5 pt-2 pb-1.5 grid gap-0.5'}>
                <span className={phone
                    ? 'text-[17px] font-bold text-brand-text'
                    : 'text-[10.5px] font-bold tracking-[0.1em] uppercase text-brand-muted'}>
                    Quién la atiende
                </span>
                {line && <span className={`${phone ? 'text-[13px]' : 'text-xs'} text-brand-muted`}>Pueden atender {lineLabel(line)}</span>}
            </div>
            {assignees.isLoading && [0, 1, 2].map(row => (
                <div key={row} className="flex items-center gap-2.5 px-2.5 py-2">
                    <SkeletonBox className="w-7 h-7 rounded-[7px]" />
                    <span className="grid gap-1.5"><SkeletonLine width="120px" /><SkeletonLine soft width="56px" /></span>
                </div>
            ))}
            {assignees.isError && <div className="px-2.5 py-3 text-[13px] text-brand-danger">No se pudo cargar la lista.</div>}
            {assignees.data && options.map(option => (
                <button key={option.key} type="button" onClick={() => pick(option.id, option.name)} disabled={busy}
                    className={`w-full text-left flex items-center gap-2.5 rounded-lg cursor-pointer hover:bg-brand-bg transition-colors
                        ${phone ? 'min-h-14 px-2 gap-3' : 'px-2.5 py-2'}
                        ${option.id === null ? 'border-t border-brand-raised rounded-t-none' : ''}`}>
                    {option.id === null ? <UnassignedBadge size={28} /> : <PersonBadge name={option.name} isMe={option.isMe} size={28} />}
                    <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-brand-text">
                            <span className="truncate">{option.label}</span>
                            {option.isMe && (
                                <span className="flex-none text-[11px] font-semibold text-brand-gray-600 bg-brand-raised rounded-full px-[7px] py-px">tú</span>
                            )}
                        </span>
                        <span className="block text-xs text-brand-muted truncate">{option.detail}</span>
                    </span>
                    {option.on && <Check size={15} strokeWidth={2.6} className="flex-none text-brand-accent-strong" />}
                </button>
            ))}
        </>
    );

    return (
        <div className="relative flex items-center gap-2">
            <button type="button" onClick={canOpen ? () => setOpen(o => !o) : undefined} disabled={!canOpen}
                aria-haspopup={canOpen ? 'menu' : undefined} aria-expanded={canOpen ? open : undefined}
                className={`inline-flex items-center gap-2 h-9 max-md:h-11 pl-3 pr-2.5 rounded-[8px] max-md:rounded-[10px] border
                    bg-brand-surface text-[13px] max-md:text-sm transition-colors disabled:cursor-default
                    ${open ? 'border-brand-success' : canOpen ? 'border-brand-border-strong cursor-pointer hover:bg-brand-bg' : 'border-brand-border'}`}>
                {current ? (
                    <>
                        <span className="text-brand-muted">Atiende</span>
                        <PersonBadge name={current.name} isMe={isMine} size={phone ? 22 : 20} />
                        <span className="font-semibold text-brand-text">{isMine ? 'Tú' : firstName(current)}</span>
                    </>
                ) : (
                    <>
                        <UnassignedBadge />
                        <span className="font-semibold text-brand-gray-600">Sin asignar</span>
                    </>
                )}
                {canOpen && <ChevronDown size={13} strokeWidth={2.2} className="text-brand-gray-600" />}
            </button>

            {!current && (
                <button type="button" onClick={takeIt} disabled={busy}
                    className="inline-flex items-center h-9 max-md:h-11 px-3.5 rounded-[8px] max-md:rounded-[10px] bg-brand-accent
                        hover:bg-brand-accent-hover text-[13px] max-md:text-sm font-semibold text-brand-ink transition-colors cursor-pointer
                        disabled:cursor-not-allowed disabled:bg-brand-raised disabled:text-brand-subtle">
                    Tomar
                </button>
            )}

            {open && (
                <>
                    <div onClick={() => setOpen(false)} aria-hidden="true"
                        className={`fixed inset-0 z-30 ${phone ? 'bg-brand-ink/50' : ''}`} />
                    <div role="menu"
                        className={phone
                            ? 'fixed inset-x-0 bottom-0 z-40 bg-brand-surface rounded-t-[20px] px-3 pt-2.5 pb-[calc(28px+var(--safe-bottom))] grid gap-0.5'
                            : 'absolute top-11 right-0 z-40 w-[300px] bg-brand-surface border border-brand-border rounded-xl p-1.5 shadow-[0_18px_44px_rgba(14,17,22,0.16)]'}>
                        {phone && <span className="justify-self-center w-10 h-1 rounded-sm bg-brand-border-strong mb-2.5" />}
                        {menu}
                    </div>
                </>
            )}
        </div>
    );
};
