import { CustomButton } from "../../Button/Button";
import { useAuthContext } from "../../../context/auth.context";
import { useTransferRequest } from "../../../hooks/useTransferRequest";
import type { ConversationPerson } from "../../../models/conversation.mode";
import { firstName } from "../../../utils/assignment";
import { PersonBadge } from "./PersonBadge";

interface Props {
    conversationId: string;
    /** Quien la atiende: un compañero de quien mira. */
    assignedTo: ConversationPerson | null;
    /** La línea, si hay más de una: «Por Ventas no se le puede escribir…». */
    lineName?: string | null;
    /** Se la pasaron: abrirla. */
    onOpen: () => void;
    /** Con su caja (en «Conversación nueva»); sin ella dentro de la fila de su línea (la ficha). */
    framed?: boolean;
}

/**
 * Una conversación que atiende un compañero, para el agente que quiere
 * escribirle a ese contacto (diseño, 3a y 3b): quién la atiende, sin nada de lo
 * que dice, y «Solicitar que te la transfieran». Sigue la solicitud: enviada,
 * aceptada (con «Abrir conversación») o rechazada (con «Solicitar otra vez»).
 */
export const TransferRequestCard = ({ conversationId, assignedTo, lineName, onOpen, framed = false }: Props) => {
    const { user } = useAuthContext();
    const { state, request, isPending, reset } = useTransferRequest(conversationId);
    const owner = firstName(assignedTo);

    const view = state.status === 'accepted' ? {
        badge: <PersonBadge name={user?.name ?? null} isMe size={28} />,
        title: `${firstName(state.answeredBy)} te pasó la conversación`,
        detail: 'Ya está en «Mías».',
        // Verde profundo y no menta: la ficha ya tiene su acción principal arriba.
        action: <CustomButton variant="secondary" onClick={() => { reset(); onOpen(); }}>Abrir conversación</CustomButton>,
    } : state.status === 'rejected' ? {
        badge: <PersonBadge name={assignedTo?.name ?? null} size={28} />,
        title: `${firstName(state.answeredBy)} no te la pasó`,
        detail: `La sigue atendiendo ${owner}.`,
        action: <CustomButton variant="outline" onClick={request} isLoading={isPending}>Solicitar otra vez</CustomButton>,
    } : state.status === 'sent' ? {
        badge: <PersonBadge name={assignedTo?.name ?? null} size={28} />,
        title: 'Solicitud enviada',
        detail: `Te avisamos cuando ${owner} o un supervisor responda.`,
        action: null,
    } : {
        badge: <PersonBadge name={assignedTo?.name ?? null} size={28} />,
        title: `Esta conversación la atiende ${owner}`,
        detail: lineName ? `Por ${lineName} no se le puede escribir mientras tanto.` : 'No se le puede escribir mientras tanto.',
        action: <CustomButton variant="outline" onClick={request} isLoading={isPending}>Solicitar que te la transfieran</CustomButton>,
    };

    return (
        <div className={`grid gap-3 p-3.5 bg-brand-bg ${framed ? 'border border-brand-raised rounded-[10px]' : ''}`}>
            <div className="flex gap-2.5 items-start">
                {view.badge}
                <div className="grid gap-[3px] min-w-0">
                    <span className="text-sm font-semibold text-brand-text">{view.title}</span>
                    <span className="text-[13px] leading-[1.5] text-brand-gray-600">{view.detail}</span>
                </div>
            </div>
            {view.action && <div className="h-10">{view.action}</div>}
        </div>
    );
};
