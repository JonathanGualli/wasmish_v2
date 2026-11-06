import { UserRound } from "lucide-react";
import type { ConversationEvent } from "../../../models/conversation.event.model";
import { eventText } from "../../../utils/assignment";
import { PersonBadge, UnassignedBadge } from "./PersonBadge";

/**
 * Un cambio de manos en el hilo (diseño «Avisos de la asignación», 6a): una
 * línea centrada, sin burbuja, con el mini avatar de quien lo hizo (menta si
 * fue quien mira), el texto y la hora. Al quitar el acceso, la casilla
 * punteada de «Sin asignar». No es un mensaje: no lo ve el cliente.
 *
 * «Pide una persona» (bot con menús, diseño «Respuestas automáticas v4», c1):
 * al pedirla, el icono de persona en ámbar; al quitar la marca, en gris.
 */
export const ConversationEventLine = ({ event, viewerId, time, contactTitle }: {
    event: ConversationEvent;
    viewerId: string;
    time: string;
    /** El título de la conversación: «Marisol pidió hablar con una persona». */
    contactTitle?: string | null;
}) => {
    const handoff = event.type === 'handoff';
    const handoffCleared = event.type === 'handoff_cleared';
    return (
        <div className={`self-center max-w-[84%] flex items-center gap-2 py-0.5 text-[12.5px] leading-[1.4] text-center
            ${handoff ? 'text-brand-handoff-text' : 'text-brand-gray-600'}`}>
            {handoff || handoffCleared ? (
                <span className={`flex-none w-[18px] h-[18px] rounded-[5px] flex items-center justify-center
                    ${handoff ? 'bg-brand-handoff-soft text-brand-handoff-strong' : 'bg-brand-border text-brand-gray-600'}`}>
                    <UserRound size={11} strokeWidth={2.6} />
                </span>
            ) : event.type === 'revoked' || !event.actor
                ? <UnassignedBadge size={16} />
                : <PersonBadge name={event.actor.name} isMe={event.actor.id === viewerId} size={18} />}
            <span>{eventText(event, viewerId, contactTitle)}</span>
            <span className="flex-none font-mono text-[11px] text-brand-subtle">{time}</span>
        </div>
    );
};
