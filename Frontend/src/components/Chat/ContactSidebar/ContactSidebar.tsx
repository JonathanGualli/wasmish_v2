import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, ChevronLeft, LoaderCircle, X } from "lucide-react";
import { useLiveContact } from "../../../hooks/useContacts";
import { formatRemaining, useConversationWindow } from "../../../hooks/useConversationWindow";
import type { ContactDetail, ContactsNavigationState } from "../../../models/contact.model";
import { ContactsPath } from "../../../models/routes.models";
import { contactIdentity, contactTitle } from "../../../utils/contactDisplay";
import { formatTimeAgo } from "../../../utils/formatChatTime";
import { ContactAvatar } from "../../../pages/private/Contacts/ContactRow";
import { Callout } from "../../Callout/Callout";
import { CustomButton } from "../../Button/Button";
import { ContactSidebarTags } from "./ContactSidebarTags";
import { ContactNotes } from "./ContactNotes";
import { ContactDataCard } from "./ContactDataCard";

interface Props {
    contactId: string;
    conversationId: string;
    /** El de la conversación: a diferencia del del contacto, sigue ahí cuando la ventana se cierra. */
    windowExpiresAt?: string | null;
    onClose: () => void;
}

/**
 * La ficha del contacto en Chats, ordenada para quien atiende: quién es, sus
 * etiquetas y la ventana arriba (sobre verde profundo), y debajo notas, datos y
 * cifras. Se edita en el sitio. La columna y su posición las pone `ChatThread`.
 */
export const ContactSidebar = ({ contactId, conversationId, windowExpiresAt, onClose }: Props) => {
    const { data: contact, isError } = useLiveContact(contactId, conversationId);

    return (
        <aside aria-label="Ficha del contacto" className="h-full flex flex-col bg-brand-raised">
            <div className="flex-none bg-brand-deep text-white px-4 pt-3.5 pb-4 grid gap-3.5">
                <SidebarTopBar onClose={onClose} />
                {contact && <ContactIdentity contact={contact} windowExpiresAt={windowExpiresAt} />}
            </div>

            {contact ? (
                <>
                    <div className="flex-1 min-h-0 overflow-y-auto p-3.5 grid gap-2.5 content-start">
                        {contact.marketingOptOut && (
                            <Callout tone="warning" icon={<AlertTriangle size={16} />} title="Pidió no recibir publicidad.">
                                Solo plantillas de servicio o utilidad.
                            </Callout>
                        )}
                        {/* Por contacto: al cambiar de conversación, el de antes termina de guardar lo suyo. */}
                        <ContactNotes key={contact.id} contact={contact} />
                        <ContactDataCard key={`data-${contact.id}`} contact={contact} />
                        <ActivityCard contact={contact} />
                    </div>
                    <div className="flex-none px-3.5 pb-3.5">
                        <SeeInContacts contactId={contact.id} />
                    </div>
                </>
            ) : (
                <div className="flex-1 flex items-center justify-center gap-2 p-8 text-sm text-brand-muted">
                    {isError ? 'No se pudo cargar el contacto.' : <><LoaderCircle size={16} className="animate-spin" />Cargando…</>}
                </div>
            )}
        </aside>
    );
};

/** Escritorio: «Ficha», Esc y la X. Móvil: volver al chat, como la bandeja. */
const SidebarTopBar = ({ onClose }: { onClose: () => void }) => (
    <div className="flex items-center min-h-8">
        <button
            type="button"
            onClick={onClose}
            className="md:hidden -ml-1 flex items-center gap-1 h-10 pr-2 text-[15px] font-semibold text-brand-on-deep cursor-pointer"
        >
            <ChevronLeft size={20} strokeWidth={2.2} />Chat
        </button>
        <span className="hidden md:block text-[11px] font-bold uppercase tracking-[0.1em] text-brand-on-deep-muted">Ficha</span>
        <kbd className="hidden md:block ml-auto font-mono text-[10.5px] text-brand-on-deep-muted border border-brand-deep-active
            rounded-[4px] px-[5px] py-px">
            Esc
        </kbd>
        <button
            type="button"
            onClick={onClose}
            title="Cerrar la ficha"
            className="hidden md:flex ml-2 w-8 h-8 rounded-lg items-center justify-center text-brand-on-deep
                hover:bg-brand-deep-hover transition-colors cursor-pointer"
        >
            <X size={18} />
        </button>
    </div>
);

const ContactIdentity = ({ contact, windowExpiresAt }: { contact: ContactDetail; windowExpiresAt?: string | null }) => {
    const title = contactTitle(contact);
    const identity = contactIdentity(contact);
    // El nombre que tiene en WhatsApp, si no es el que se le puso aquí.
    const profileName = contact.profileName && contact.profileName !== contact.name ? `«${contact.profileName}»` : null;
    const details = [contact.company, profileName].filter(Boolean).join(' · ');

    return (
        <>
            <div className="flex gap-3 items-center">
                <ContactAvatar contact={contact} size="lg" tone="onDeep" />
                <div className="min-w-0 grid gap-0.5">
                    <div className="text-[19px] font-bold tracking-[-0.015em] leading-tight break-words">{title}</div>
                    {details && <div className="text-[12.5px] text-brand-on-deep truncate">{details}</div>}
                    {title !== identity && <div className="font-mono text-xs text-brand-on-deep-muted">{identity}</div>}
                    {!contact.phone && <div className="text-xs text-brand-on-deep-muted">WhatsApp no comparte su número.</div>}
                </div>
            </div>
            <ContactSidebarTags contact={contact} />
            <WindowLine expiresAt={windowExpiresAt} />
        </>
    );
};

/** La ventana en una línea: el aviso fuerte vive abajo, en el campo de escribir. */
const WindowLine = ({ expiresAt }: { expiresAt?: string | null }) => {
    const { hasWindow, isOpen, msRemaining, msSinceClosed } = useConversationWindow(expiresAt);
    const [label, detail] = isOpen
        ? ['Ventana abierta', `quedan ${formatRemaining(msRemaining)}`]
        : hasWindow ? ['Ventana cerrada', formatTimeAgo(msSinceClosed)] : ['Nunca escribió', ''];

    return (
        <div className="flex items-center gap-2 bg-brand-ink rounded-[9px] px-3 py-[9px] text-[12.5px]">
            <span className={`w-[7px] h-[7px] rounded-full flex-none ${isOpen ? 'bg-brand-accent' : 'bg-brand-on-deep-subtle'}`} />
            <span className="text-brand-on-deep">{label}</span>
            {detail && (
                <span className={`ml-auto font-mono tabular-nums ${isOpen ? 'text-brand-accent' : 'text-brand-on-deep-muted'}`}>
                    {detail}
                </span>
            )}
        </div>
    );
};

const ActivityCard = ({ contact }: { contact: ContactDetail }) => {
    const { sent, received, failed } = contact.activity;
    return (
        <div className="bg-brand-surface rounded-xl px-3.5 py-3 flex flex-wrap gap-x-3.5 gap-y-1 text-[12.5px] text-brand-muted">
            <ActivityFigure value={sent} label={['enviado', 'enviados']} />
            <ActivityFigure value={received} label={['recibido', 'recibidos']} />
            <ActivityFigure value={failed} label={['fallido', 'fallidos']} danger={failed > 0} />
        </div>
    );
};

/** La cifra en mono y, detrás, la palabra en singular o plural. */
const ActivityFigure = ({ value, label: [singular, plural], danger = false }: {
    value: number;
    label: [string, string];
    danger?: boolean;
}) => (
    <span>
        <span className={`font-mono text-[15px] font-semibold tabular-nums ${danger ? 'text-brand-danger' : 'text-brand-text'}`}>
            {value.toLocaleString('es-EC')}
        </span>{' '}
        {value === 1 ? singular : plural}
    </span>
);

const SeeInContacts = ({ contactId }: { contactId: string }) => {
    const navigate = useNavigate();
    const state: ContactsNavigationState = { contactId };
    return (
        <div className="h-[42px]">
            <CustomButton variant="outline" onClick={() => navigate(ContactsPath, { state })}>
                <span className="flex items-center justify-center gap-2">Ver en Contactos<ArrowRight size={14} /></span>
            </CustomButton>
        </div>
    );
};
