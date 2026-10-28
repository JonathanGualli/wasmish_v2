import type { ConversationEvent } from "../../../models/conversation.event.model";
import { eventText } from "../../../utils/assignment";
import { PersonBadge, UnassignedBadge } from "./PersonBadge";

/**
 * Un cambio de manos en el hilo (diseño «Avisos de la asignación», 6a): una
 * línea centrada, sin burbuja, con el mini avatar de quien lo hizo (menta si
 * fue quien mira), el texto y la hora. Al quitar el acceso, la casilla
 * punteada de «Sin asignar». No es un mensaje: no lo ve el cliente.
 */
export const ConversationEventLine = ({ event, viewerId, time }: { event: ConversationEvent; viewerId: string; time: string }) => (
    <div className="self-center max-w-[84%] flex items-center gap-2 py-0.5 text-[12.5px] leading-[1.4] text-brand-gray-600 text-center">
        {event.type === 'revoked' || !event.actor
            ? <UnassignedBadge size={16} />
            : <PersonBadge name={event.actor.name} isMe={event.actor.id === viewerId} size={18} />}
        <span>{eventText(event, viewerId)}</span>
        <span className="flex-none font-mono text-[11px] text-brand-subtle">{time}</span>
    </div>
);
