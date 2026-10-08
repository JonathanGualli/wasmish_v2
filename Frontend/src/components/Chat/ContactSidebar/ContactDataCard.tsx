import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { contactError, useContactMutations } from "../../../hooks/useContacts";
import type { ContactDetail } from "../../../models/contact.model";
import { CONTACT_NAME_MAX, EMAIL_RE, sourceLabel } from "../../../utils/contactDisplay";
import { formatShortDate } from "../../../utils/formatChatTime";
import { AuthField } from "../../Auth/AuthField";
import { CustomButton } from "../../Button/Button";
import { ReferralCard } from "../../Contact/ReferralCard";
import { useNoticeContext } from "../../Notice/context/UseNoticeContext";
import { SidebarCard } from "./SidebarCard";

/**
 * Datos del contacto en la ficha del chat. Nombre, email y empresa se editan
 * juntos, con Guardar: un nombre a medias cambiaría la bandeja letra a letra.
 */
export const ContactDataCard = ({ contact }: { contact: ContactDetail }) => {
    const [editing, setEditing] = useState(false);

    if (editing) return <EditData contact={contact} onDone={() => setEditing(false)} />;

    // Los anteriores a los contactos se crearon al migrar: esa fecha no dice nada.
    const since = contact.activity.firstMessageAt ?? (contact.source ? contact.createdAt : null);

    return (
        <SidebarCard
            title="Datos"
            aside={
                <button type="button" onClick={() => setEditing(true)}
                    className="text-[12.5px] font-semibold text-brand-accent-strong hover:underline cursor-pointer">
                    Editar
                </button>
            }
        >
            <dl className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-2.5 gap-y-[7px] text-[13px] leading-[1.5]">
                <DataRow label="Email" value={contact.email} empty="Sin email" />
                <DataRow label="Empresa" value={contact.company} empty="Sin empresa" />
                <DataRow label="Origen" value={sourceLabel(contact.source)} />
                <DataRow label="Desde" value={since && <span className="font-mono text-[12.5px]">{formatShortDate(since)}</span>} />
            </dl>
            {contact.referral && <ReferralCard referral={contact.referral} />}
        </SidebarCard>
    );
};

const DataRow = ({ label, value, empty = '—' }: { label: string; value: ReactNode; empty?: string }) => (
    <>
        <dt className="text-brand-muted">{label}</dt>
        <dd className={`[overflow-wrap:anywhere] ${value ? 'text-brand-text' : 'text-brand-subtle'}`}>{value || empty}</dd>
    </>
);

const EditData = ({ contact, onDone }: { contact: ContactDetail; onDone: () => void }) => {
    const { update } = useContactMutations();
    const { setState, setContent } = useNoticeContext();
    const [name, setName] = useState(contact.name ?? '');
    const [email, setEmail] = useState(contact.email ?? '');
    const [company, setCompany] = useState(contact.company ?? '');
    const [emailTouched, setEmailTouched] = useState(false);

    const emailValid = !email.trim() || EMAIL_RE.test(email.trim());
    const emailError = emailTouched && !emailValid
        ? 'A este email le falta algo: debería ser como nombre@empresa.com.'
        : undefined;

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setEmailTouched(true);
        if (!emailValid) return;
        try {
            // El texto vacío borra el campo; el backend lo guarda como null.
            await update.mutateAsync({
                id: contact.id,
                input: { name: name.trim(), email: email.trim(), company: company.trim() },
            });
            onDone();
        } catch (err) {
            setContent(<div className="text-brand-danger text-sm"><p>{contactError(err).message}</p></div>);
            setState(true);
        }
    };

    // Esc cancela la edición, no cierra la ficha.
    const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        onDone();
    };

    return (
        <SidebarCard title="Datos">
            <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="grid gap-3">
                <AuthField label="Nombre" value={name} onChange={e => setName(e.target.value)}
                    maxLength={CONTACT_NAME_MAX} placeholder={contact.profileName ?? 'Ferretería La Estrella'} />
                <AuthField label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                    onBlur={() => setEmailTouched(true)} error={emailError} placeholder="nombre@empresa.com" />
                <AuthField label="Empresa" value={company} onChange={e => setCompany(e.target.value)}
                    maxLength={CONTACT_NAME_MAX} placeholder="Nombre de su negocio" />
                {contact.conversationId && (
                    <p className="flex items-center gap-1.5 text-xs text-brand-muted">
                        <Lock size={13} className="flex-none" />El teléfono no se cambia: tiene conversación.
                    </p>
                )}
                <div className="flex justify-end gap-2">
                    <div className="h-10">
                        <CustomButton variant="outline" onClick={onDone}>Cancelar</CustomButton>
                    </div>
                    <div className="h-10">
                        <CustomButton type="submit" isLoading={update.isPending}>Guardar</CustomButton>
                    </div>
                </div>
            </form>
        </SidebarCard>
    );
};
