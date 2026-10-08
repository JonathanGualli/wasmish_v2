import { useRef, useState } from "react";
import { CircleAlert, Pencil } from "lucide-react";
import { useAutosave, type AutosaveStatus } from "../../../hooks/useAutosave";
import { useAutosizeTextarea } from "../../../hooks/useAutosizeTextarea";
import { useContactMutations } from "../../../hooks/useContacts";
import type { ContactDetail } from "../../../models/contact.model";
import { CONTACT_NOTES_MAX as NOTES_MAX } from "../../../utils/contactDisplay";
import { SidebarCard } from "./SidebarCard";

/** Desde aquí se enseña cuánto queda. */
const COUNTER_FROM = 900;
const MAX_HEIGHT = 320;

/**
 * Notas cuyo guardado falló cuando su ficha ya no estaba a la vista (se cambió
 * de conversación a medio guardar). Al volver a ese contacto, el texto sigue en
 * el campo y se vuelve a intentar. Viven lo que viva la pestaña.
 */
const unsavedNotes = new Map<string, string>();

/**
 * Las notas del contacto: un solo texto que se edita en el sitio y se guarda
 * solo, al dejar de escribir 1 s y al salir del campo. Si falla, el texto se
 * queda en el campo con «Reintentar»: nunca solo en el aviso global.
 * Se monta una por contacto (`key`): lo que llegue del servidor mientras se ve
 * no pisa lo que se está escribiendo.
 */
export const ContactNotes = ({ contact }: { contact: ContactDetail }) => {
    const { saveNotes } = useContactMutations();
    const [text, setText] = useState(() => unsavedNotes.get(contact.id) ?? contact.notes ?? '');
    const [focused, setFocused] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    useAutosizeTextarea(textareaRef, text, MAX_HEIGHT);

    const { status, flush } = useAutosave(text, {
        savedValue: contact.notes ?? '',
        save: async notes => {
            await saveNotes.mutateAsync({ id: contact.id, notes });
            unsavedNotes.delete(contact.id);
        },
        onLost: notes => unsavedNotes.set(contact.id, notes),
    });

    const failed = status === 'error';
    const showCounter = focused && text.length >= COUNTER_FROM;
    const border = failed ? 'border-brand-danger' : focused ? 'border-brand-success' : 'border-transparent';

    return (
        <SidebarCard
            title="Notas"
            icon={<Pencil size={15} className="text-brand-text" />}
            className={border}
            aside={showCounter
                ? <span className="font-mono text-xs font-semibold tabular-nums text-brand-warning">{text.length} / {NOTES_MAX}</span>
                : <NotesStatus status={status} hasText={Boolean(text)} />}
        >
            <textarea
                ref={textareaRef}
                value={text}
                onChange={e => setText(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => { setFocused(false); void flush(); }}
                maxLength={NOTES_MAX}
                aria-label="Notas del contacto"
                placeholder="Apunta lo que no quieras olvidar. Ej.: paga a 30 días, prefiere que le escriban por la tarde."
                className={`w-full min-h-[96px] resize-none text-sm leading-[1.6] text-brand-strong bg-transparent
                    placeholder:text-brand-subtle focus:outline-none
                    ${text || focused ? '' : 'border border-dashed border-brand-border-strong rounded-[9px] px-3 py-2.5'}`}
            />
            {failed ? (
                <p className="flex gap-2 text-[12.5px] leading-[1.5] text-brand-strong">
                    <CircleAlert size={15} className="flex-none mt-0.5 text-brand-danger" />
                    <span>
                        <span className="font-semibold text-brand-danger">No se pudo guardar.</span>{' '}
                        Tu texto sigue aquí; revisa la conexión.{' '}
                        <button type="button" onClick={() => void flush()}
                            className="font-semibold text-brand-accent-strong underline cursor-pointer">
                            Reintentar
                        </button>
                    </span>
                </p>
            ) : text && (
                <p className="text-[11.5px] text-brand-subtle">Escribe directamente · se guarda solo</p>
            )}
        </SidebarCard>
    );
};

const NotesStatus = ({ status, hasText }: { status: AutosaveStatus; hasText: boolean }) => {
    if (status === 'error') return <span className="text-xs font-semibold text-brand-danger">Sin guardar</span>;
    if (status === 'pending' || status === 'saving') return <span className="text-xs font-semibold text-brand-muted">Guardando…</span>;
    // Lo que había al abrir la ficha también está guardado.
    if (status === 'saved' || hasText) return <span className="text-xs font-semibold text-brand-success">Guardado</span>;
    return null;
};
