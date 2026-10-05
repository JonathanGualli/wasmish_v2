import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { ConfirmDialog } from '../../../components/Dialog/ConfirmDialog';
import {
    AlertTriangle, ChevronLeft, ExternalLink, LoaderCircle, Lock, Megaphone, MessageSquare, Pencil, Send, Trash2, X,
} from 'lucide-react';
import { CustomButton } from '../../../components/Button/Button';
import { Callout } from '../../../components/Callout/Callout';
import { Pill } from '../../../components/Pill/Pill';
import { useModalContext } from '../../../components/Modal/context/UseModalContext';
import { contactError, useContact, useContactMutations } from '../../../hooks/useContacts';
import { formatRemaining, useConversationWindow } from '../../../hooks/useConversationWindow';
import type { ContactDetail } from '../../../models/contact.model';
import type { ChatsNavigationState } from '../../../models/conversation.mode';
import { AppRoutes } from '../../../models/routes.models';
import { contactIdentity, contactTitle, referralTypeLabel, sourceLabel } from '../../../utils/contactDisplay';
import { formatActivityTime, formatDateTime } from '../../../utils/formatChatTime';
import { ContactAvatar } from './ContactRow';
import { ContactForm } from './ContactForm';

export type ContactPanelState =
    | { mode: 'view'; id: string }
    | { mode: 'edit'; id: string }
    | { mode: 'create' };

interface Props {
    state: ContactPanelState | null;
    onChange: (state: ContactPanelState | null) => void;
}

/**
 * Panel lateral de Contactos: la ficha, y crear o editar en el mismo sitio.
 * En escritorio se abre sobre la lista; en móvil ocupa la pantalla.
 */
export const ContactPanel = ({ state, onChange }: Props) => {
    const { state: errorVisible } = useModalContext();
    const close = () => onChange(null);

    // El modal de error vive en otro portal: para el Dialog, pulsar su X es un
    // «clic fuera» y cerraría el panel con lo escrito (igual que en Chats).
    const handleDialogClose = () => {
        if (!errorVisible) close();
    };

    return (
        <Dialog open={Boolean(state)} onClose={handleDialogClose} className="relative z-50">
            <DialogBackdrop className="fixed inset-0 bg-brand-ink/30" />
            <div className="fixed inset-0 flex justify-end">
                <DialogPanel className="w-full md:w-[480px] h-full bg-brand-surface flex flex-col
                    md:border-l md:border-brand-border md:shadow-[-24px_0_48px_rgba(14,17,22,0.10)]">
                    {state?.mode === 'view' && (
                        <ContactView
                            id={state.id}
                            onClose={close}
                            onEdit={() => onChange({ mode: 'edit', id: state.id })}
                        />
                    )}
                    {state?.mode === 'edit' && (
                        <EditContact
                            id={state.id}
                            onCancel={() => onChange({ mode: 'view', id: state.id })}
                            onChange={onChange}
                        />
                    )}
                    {state?.mode === 'create' && (
                        <>
                            <PanelHeader title="Nuevo contacto" strong onClose={close} />
                            <ContactForm
                                onCancel={close}
                                onSaved={id => onChange({ mode: 'view', id })}
                                onViewContact={id => onChange({ mode: 'view', id })}
                            />
                        </>
                    )}
                </DialogPanel>
            </div>
        </Dialog>
    );
};

/** Escritorio: título y X. Móvil: volver a la lista, y la acción que haya. */
const PanelHeader = ({ title, strong = false, onClose, mobileAction }: {
    title: string;
    strong?: boolean;
    onClose: () => void;
    mobileAction?: ReactNode;
}) => (
    <div className="flex-none h-14 border-b border-brand-border px-4 md:pl-6 md:pr-5 flex items-center gap-2">
        <button
            type="button"
            onClick={onClose}
            title="Volver a contactos"
            className="md:hidden -ml-1 text-brand-strong hover:text-brand-text transition-colors cursor-pointer"
        >
            <ChevronLeft size={22} strokeWidth={2.2} />
        </button>
        <DialogTitle className={strong
            ? 'text-[17px] font-bold tracking-[-0.015em] text-brand-text'
            : 'text-[13px] font-semibold text-brand-muted'}>
            {title}
        </DialogTitle>
        <div className="ml-auto flex items-center">
            {mobileAction && <span className="md:hidden">{mobileAction}</span>}
            <button
                type="button"
                onClick={onClose}
                title="Cerrar"
                className="hidden md:flex w-8 h-8 rounded-lg items-center justify-center text-brand-muted
                    hover:bg-brand-bg hover:text-brand-text transition-colors cursor-pointer"
            >
                <X size={18} />
            </button>
        </div>
    </div>
);

const PanelState = ({ children }: { children: ReactNode }) => (
    <div className="flex-1 flex items-center justify-center gap-2 p-8 text-sm text-brand-muted">{children}</div>
);

/** Carga el contacto y lo pasa al formulario, que arranca con sus valores. */
const EditContact = ({ id, onCancel, onChange }: {
    id: string;
    onCancel: () => void;
    onChange: (state: ContactPanelState | null) => void;
}) => {
    const { data: contact, isError } = useContact(id);
    return (
        <>
            <PanelHeader title="Editar contacto" strong onClose={onCancel} />
            {contact ? (
                <ContactForm
                    contact={contact}
                    onCancel={onCancel}
                    onSaved={savedId => onChange({ mode: 'view', id: savedId })}
                    onViewContact={otherId => onChange({ mode: 'view', id: otherId })}
                />
            ) : (
                <PanelState>{isError ? 'No se pudo cargar el contacto.' : <><LoaderCircle size={16} className="animate-spin" />Cargando…</>}</PanelState>
            )}
        </>
    );
};

const SectionLabel = ({ children }: { children: ReactNode }) => (
    <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-muted">{children}</div>
);

const ContactView = ({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: () => void }) => {
    const { data: contact, isError } = useContact(id);

    return (
        <>
            <PanelHeader
                title="Ficha de contacto"
                onClose={onClose}
                mobileAction={contact && (
                    <button
                        type="button"
                        onClick={onEdit}
                        className="flex items-center gap-1.5 px-2 h-10 text-sm font-semibold text-brand-strong cursor-pointer"
                    >
                        <Pencil size={15} />Editar
                    </button>
                )}
            />
            {contact ? (
                <ContactDetails contact={contact} onClose={onClose} onEdit={onEdit} />
            ) : (
                <PanelState>{isError ? 'No se pudo cargar el contacto.' : <><LoaderCircle size={16} className="animate-spin" />Cargando…</>}</PanelState>
            )}
        </>
    );
};

const ContactDetails = ({ contact, onClose, onEdit }: {
    contact: ContactDetail;
    onClose: () => void;
    onEdit: () => void;
}) => {
    const navigate = useNavigate();
    const window24 = useConversationWindow(contact.windowExpiresAt);
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    const hasConversation = Boolean(contact.conversationId);
    const title = contactTitle(contact);
    const showProfileName = Boolean(contact.name && contact.profileName && contact.name !== contact.profileName);

    // A Chats: su conversación, o una nueva con su número (reemplaza el borrador
    // que hubiera). Un contacto sin conversación siempre tiene teléfono: los que
    // llegan sin él es porque escribieron, y escribir crea la conversación.
    const openInChats = () => {
        const state: ChatsNavigationState = contact.conversationId
            ? { conversationId: contact.conversationId }
            : { draft: { phone: contact.phone ?? '', name: contact.name || contact.profileName || '' } };
        navigate(`${AppRoutes.private.root}/${AppRoutes.private.chats}`, { state });
    };

    const windowInfo = window24.isOpen
        ? { title: 'Ventana de 24 h abierta', right: `cierra en ${formatRemaining(window24.msRemaining)}`,
            sub: 'Puedes escribirle texto libre.', box: 'bg-brand-green-50 border-brand-green-100', dot: 'bg-brand-success' }
        : window24.hasWindow
            ? { title: 'Ventana de 24 h cerrada', right: '',
                sub: 'Solo puedes enviarle plantillas aprobadas.', box: 'bg-brand-bg border-brand-border', dot: 'bg-brand-subtle' }
            : { title: 'Nunca escribió', right: '',
                sub: 'Hasta que escriba, solo plantillas aprobadas.', box: 'bg-brand-bg border-brand-border', dot: 'bg-brand-border-strong' };

    const data: [string, ReactNode][] = [
        ['Email', contact.email],
        ['Empresa', contact.company],
        ['Notas', contact.notes && <span className="whitespace-pre-wrap">{contact.notes}</span>],
        ['Origen', sourceLabel(contact.source)],
        // Los anteriores a los contactos se crearon al migrar: esa fecha no dice nada.
        ['Creado', contact.source && <span className="font-mono text-[13px] tabular-nums">{formatDateTime(contact.createdAt)}</span>],
    ];

    return (
        <>
            <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5 grid gap-[22px] content-start">
                <div className="flex gap-3.5 items-center">
                    <ContactAvatar contact={contact} size="lg" strong />
                    <div className="min-w-0 grid gap-0.5">
                        <div className="text-xl font-bold tracking-[-0.02em] text-brand-text break-words">{title}</div>
                        {showProfileName && (
                            <div className="text-[13px] text-brand-muted">
                                En WhatsApp: <span className="font-medium text-brand-strong">{contact.profileName}</span>
                            </div>
                        )}
                        {title !== contactIdentity(contact) && (
                            <div className="font-mono text-[13px] text-brand-strong">
                                {contactIdentity(contact)}
                                {!contact.phone && <span className="font-sans text-xs text-brand-muted"> · WhatsApp no comparte su número.</span>}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex gap-2">
                    <div className="flex-1 h-10">
                        <CustomButton onClick={openInChats} disabled={!hasConversation && !contact.phone}>
                            <span className="flex items-center justify-center gap-2">
                                {hasConversation ? <MessageSquare size={16} /> : <Send size={16} />}
                                {hasConversation ? 'Abrir conversación' : 'Enviar plantilla'}
                            </span>
                        </CustomButton>
                    </div>
                    <div className="hidden md:block h-10">
                        <CustomButton variant="outline" onClick={onEdit}>
                            <span className="flex items-center gap-2"><Pencil size={15} />Editar</span>
                        </CustomButton>
                    </div>
                </div>

                {contact.marketingOptOut && (
                    <Callout tone="warning" icon={<AlertTriangle size={16} />} title="Pidió no recibir publicidad">
                        Solo se le pueden enviar plantillas de servicio o utilidad.
                    </Callout>
                )}

                <div className="grid gap-2.5">
                    <SectionLabel>Actividad</SectionLabel>
                    <div className={`border rounded-xl px-3.5 py-3 grid gap-0.5 ${windowInfo.box}`}>
                        <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full flex-none ${windowInfo.dot}`} />
                            <span className="text-sm font-semibold text-brand-text">{windowInfo.title}</span>
                            {windowInfo.right && (
                                <span className="ml-auto font-mono text-xs font-medium text-brand-accent-strong">{windowInfo.right}</span>
                            )}
                        </div>
                        <div className="text-[12.5px] text-brand-strong pl-4">{windowInfo.sub}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-px bg-brand-border border border-brand-border rounded-xl overflow-hidden">
                        <div className="bg-brand-surface px-3.5 py-2.5">
                            <div className="text-xs text-brand-muted">Primer contacto</div>
                            <div className="font-mono text-[13px] tabular-nums mt-0.5">
                                {contact.activity.firstMessageAt ? formatDateTime(contact.activity.firstMessageAt) : '—'}
                            </div>
                        </div>
                        <div className="bg-brand-surface px-3.5 py-2.5">
                            <div className="text-xs text-brand-muted">Última interacción</div>
                            <div className="font-mono text-[13px] tabular-nums mt-0.5">
                                {contact.lastInteractionAt ? formatActivityTime(contact.lastInteractionAt) : '—'}
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {([
                            ['Enviados', contact.activity.sent],
                            ['Recibidos', contact.activity.received],
                            ['Fallidos', contact.activity.failed],
                        ] as const).map(([label, value]) => (
                            <div key={label} className="bg-brand-bg rounded-[10px] px-3 py-2.5">
                                <div className={`font-mono text-lg font-semibold tabular-nums
                                    ${label === 'Fallidos' && value > 0 ? 'text-brand-danger' : 'text-brand-text'}`}>
                                    {value}
                                </div>
                                <div className="text-xs text-brand-muted">{label}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {contact.referral && (
                    <div className="grid gap-2.5">
                        <SectionLabel>Desde un anuncio</SectionLabel>
                        <div className="border border-brand-border rounded-xl p-3.5 flex gap-3">
                            <div className="w-9 h-9 rounded-[9px] bg-brand-accent-soft text-brand-accent-strong
                                flex items-center justify-center flex-none">
                                <Megaphone size={17} />
                            </div>
                            <div className="min-w-0 grid gap-1.5 justify-items-start">
                                <Pill>{referralTypeLabel(contact.referral.sourceType)}</Pill>
                                <div className="text-sm font-semibold leading-[1.4] text-brand-text">
                                    {contact.referral.headline || contact.referral.body || 'Sin título'}
                                </div>
                                {/* Meta no siempre manda el enlace. */}
                                {contact.referral.sourceUrl && (
                                    <a
                                        href={contact.referral.sourceUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-accent-strong hover:text-brand-deep"
                                    >
                                        Ver en Facebook<ExternalLink size={13} />
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                <div className="grid gap-2.5">
                    <SectionLabel>Datos</SectionLabel>
                    <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3.5 gap-y-[11px] text-[13.5px] leading-[1.5]">
                        {data.map(([label, value]) => (
                            <div key={label} className="contents">
                                <dt className="text-brand-muted">{label}</dt>
                                <dd className={`[overflow-wrap:anywhere] ${value ? 'text-brand-text' : 'text-brand-subtle'}`}>{value || '—'}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </div>

            <div className="flex-none border-t border-brand-border px-4 md:px-6 py-3.5">
                {hasConversation ? (
                    <div className="flex items-center gap-3">
                        <span className="flex-none inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-brand-bg
                            text-[13px] font-semibold text-brand-subtle cursor-not-allowed">
                            <Lock size={14} />Eliminar
                        </span>
                        <span className="text-[12.5px] leading-[1.45] text-brand-muted">
                            Tiene conversación: su historial se conserva. Puedes editar sus datos.
                        </span>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setConfirmingDelete(true)}
                        className="-ml-3 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-semibold
                            text-brand-danger hover:bg-brand-danger-soft transition-colors cursor-pointer"
                    >
                        <Trash2 size={15} />Eliminar contacto
                    </button>
                )}
            </div>

            <DeleteContactDialog
                contact={contact}
                open={confirmingDelete}
                onCancel={() => setConfirmingDelete(false)}
                onDeleted={onClose}
            />
        </>
    );
};

const DeleteContactDialog = ({ contact, open, onCancel, onDeleted }: {
    contact: ContactDetail;
    open: boolean;
    onCancel: () => void;
    onDeleted: () => void;
}) => {
    const { remove } = useContactMutations();
    const { setState, setContent } = useModalContext();

    const handleDelete = async () => {
        try {
            await remove.mutateAsync(contact.id);
            onDeleted();
        } catch (err) {
            onCancel();
            setContent(<div className="text-brand-danger text-sm"><p>{contactError(err).message}</p></div>);
            setState(true);
        }
    };

    return (
        <ConfirmDialog
            open={open}
            tone="danger"
            icon={<Trash2 size={19} />}
            title={`¿Eliminar a ${contactTitle(contact)}?`}
            description="No tiene conversaciones; se borran solo sus datos."
            confirmLabel="Eliminar"
            isLoading={remove.isPending}
            onConfirm={handleDelete}
            onCancel={onCancel}
        />
    );
};
