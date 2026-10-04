import { useState, type ReactNode } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import { AuthField } from '../../../components/Auth/AuthField';
import { CustomButton } from '../../../components/Button/Button';
import { Callout } from '../../../components/Callout/Callout';
import { useModalContext } from '../../../components/Modal/context/UseModalContext';
import { contactError, useContactByPhone, useContactMutations } from '../../../hooks/useContacts';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import type { ContactDetail, ContactInput } from '../../../models/contact.model';
import { PHONE_RE, contactTitle } from '../../../utils/contactDisplay';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 80;
const NOTES_MAX = 1000;

interface Props {
    /** El contacto a editar; sin él, el formulario crea uno nuevo. */
    contact?: ContactDetail;
    onCancel: () => void;
    onSaved: (id: string) => void;
    /** «Ver contacto» desde el aviso de número duplicado. */
    onViewContact: (id: string) => void;
}

const Optional = ({ children }: { children: ReactNode }) => (
    <>{children}<span className="ml-1.5 font-normal text-brand-subtle">opcional</span></>
);

const Counter = ({ value, max }: { value: string; max: number }) => (
    <span className="font-mono text-[11px] font-normal text-brand-subtle tabular-nums">{value.length}/{max}</span>
);

/**
 * Crear o editar un contacto. Solo los campos que pone quien usa Wasmish: el
 * nombre de WhatsApp, el usuario y el origen los trae WhatsApp. El teléfono de
 * un contacto con conversación no se edita: para WhatsApp el número es la
 * persona, y el historial y la ventana de 24 h son de ese número.
 */
export const ContactForm = ({ contact, onCancel, onSaved, onViewContact }: Props) => {
    const [phone, setPhone] = useState(contact?.phone ?? '');
    const [name, setName] = useState(contact?.name ?? '');
    const [email, setEmail] = useState(contact?.email ?? '');
    const [company, setCompany] = useState(contact?.company ?? '');
    const [notes, setNotes] = useState(contact?.notes ?? '');
    const [touched, setTouched] = useState({ phone: false, email: false });
    // El 409 del backend, por si el aviso de duplicado no llegó a tiempo.
    const [serverDuplicateId, setServerDuplicateId] = useState<string | null>(null);

    const { create, update } = useContactMutations();
    const { setState, setContent } = useModalContext();
    const isPending = create.isPending || update.isPending;

    const phoneLocked = Boolean(contact?.conversationId);
    const digits = phone.replace(/\D/g, '');
    const phoneValid = PHONE_RE.test(digits);
    const emailValid = !email.trim() || EMAIL_RE.test(email.trim());

    // Avisar del duplicado mientras se escribe, sin esperar al 409 al guardar.
    const lookup = useDebouncedValue(!phoneLocked && phoneValid && digits !== contact?.phone ? digits : '', 400);
    const match = useContactByPhone(lookup);
    const duplicate = match && match.id !== contact?.id && lookup === digits ? match : null;
    const duplicateId = duplicate?.id ?? (serverDuplicateId && lookup === digits ? serverDuplicateId : null);

    const phoneError = phoneLocked || !touched.phone ? undefined
        : !digits ? 'El teléfono es obligatorio.'
        : !phoneValid ? 'Faltan dígitos o sobran símbolos. Con código de país: 593 99 123 4567 se escribe 593991234567.'
        : undefined;
    const emailError = touched.email && !emailValid
        ? 'A este email le falta algo: debería ser como nombre@empresa.com.'
        : undefined;

    const status = phoneLocked ? ''
        : !digits ? 'Escribe el teléfono para continuar.'
        : phoneError || emailError ? 'Corrige los campos marcados.'
        : duplicateId ? 'Ese número ya tiene contacto.'
        : '';
    const canSubmit = (phoneLocked || (phoneValid && !duplicateId)) && emailValid && !isPending;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setTouched({ phone: true, email: true });
        if (!canSubmit) return;

        // El texto vacío borra el campo; el backend lo guarda como null.
        const input: ContactInput = { name: name.trim(), email: email.trim(), company: company.trim(), notes: notes.trim() };
        if (!phoneLocked) input.phone = digits;

        try {
            const saved = contact
                ? await update.mutateAsync({ id: contact.id, input })
                : await create.mutateAsync(input);
            onSaved(saved.id);
        } catch (err) {
            const error = contactError(err);
            if (error.field === 'phone' && error.contactId) {
                setServerDuplicateId(error.contactId);
                return;
            }
            setContent(<div className="text-brand-danger text-sm"><p>{error.message}</p></div>);
            setState(true);
        }
    };

    const intro = contact
        ? (contact.profileName
            ? `El nombre de WhatsApp («${contact.profileName}») llega solo con sus mensajes y no se edita aquí.`
            : 'Cambia lo que necesites; lo que dejes vacío se borra.')
        : 'Crear un contacto no envía ningún mensaje. Para escribirle, usa «Enviar plantilla» desde su ficha.';

    return (
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5 grid gap-[18px] content-start">
                <p className="text-[13px] leading-[1.5] text-brand-muted">{intro}</p>

                <AuthField
                    label={phoneLocked ? 'Teléfono' : <>Teléfono<span className="ml-1.5 font-normal text-brand-subtle">obligatorio</span></>}
                    labelAction={phoneLocked && <Lock size={13} className="text-brand-muted" />}
                    value={phone}
                    onChange={e => { setPhone(e.target.value); setServerDuplicateId(null); }}
                    onBlur={() => setTouched(t => ({ ...t, phone: true }))}
                    placeholder="593991234567"
                    inputMode="numeric"
                    autoComplete="off"
                    mono
                    readOnly={phoneLocked}
                    error={phoneError}
                    hint={phoneLocked
                        ? 'El número no se puede cambiar: el historial de WhatsApp es de este número.'
                        : 'Con código de país, sin + ni espacios.'}
                />

                {duplicateId && (
                    <Callout
                        tone="warning"
                        icon={<AlertTriangle size={16} />}
                        title={duplicate ? `Este número ya es de ${contactTitle(duplicate)}` : 'Este número ya es de otro contacto'}
                    >
                        No hace falta crearlo otra vez.{' '}
                        <button
                            type="button"
                            onClick={() => onViewContact(duplicateId)}
                            className="font-semibold text-brand-accent-strong underline underline-offset-2 cursor-pointer"
                        >
                            Ver contacto
                        </button>
                    </Callout>
                )}

                <AuthField
                    label={<Optional>Nombre</Optional>}
                    labelAction={<Counter value={name} max={NAME_MAX} />}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ferretería La Estrella"
                    maxLength={NAME_MAX}
                />
                <AuthField
                    label={<Optional>Email</Optional>}
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onBlur={() => setTouched(t => ({ ...t, email: true }))}
                    placeholder="nombre@empresa.com"
                    error={emailError}
                />
                <AuthField
                    label={<Optional>Empresa</Optional>}
                    labelAction={<Counter value={company} max={NAME_MAX} />}
                    value={company}
                    onChange={e => setCompany(e.target.value)}
                    placeholder="Nombre de su negocio"
                    maxLength={NAME_MAX}
                />
                <AuthField
                    label={<Optional>Notas</Optional>}
                    labelAction={<Counter value={notes} max={NOTES_MAX} />}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Prefiere que le escriban por la tarde…"
                    maxLength={NOTES_MAX}
                    rows={4}
                />
            </div>

            <div className="flex-none border-t border-brand-border px-4 md:px-6 py-3.5 flex items-center gap-2.5">
                <span className="flex-1 min-w-0 text-[12.5px] text-brand-muted">{status}</span>
                <div className="h-10">
                    <CustomButton variant="outline" onClick={() => { if (!isPending) onCancel(); }}>
                        Cancelar
                    </CustomButton>
                </div>
                <div className="h-10">
                    <CustomButton type="submit" isLoading={isPending} disabled={!canSubmit}>
                        {contact ? 'Guardar cambios' : 'Crear contacto'}
                    </CustomButton>
                </div>
            </div>
        </form>
    );
};
