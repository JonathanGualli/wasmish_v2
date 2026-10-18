import { useEffect, useRef, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { useAutosizeTextarea } from "../../../hooks/useAutosizeTextarea";
import { CONTACT_NOTES_MAX } from "../../../utils/contactDisplay";
import { NOTE_COUNTER_FROM } from "../../../utils/contactNotes";

const MAX_HEIGHT = 320;

interface Props {
    value: string;
    onChange: (value: string) => void;
    onSave: () => void;
    /** Sin él no hay «Cancelar» (la primera nota: el campo ya abierto invita a escribir). */
    onCancel?: () => void;
    saveLabel?: string;
    cancelLabel?: string;
    placeholder?: string;
    autoFocus?: boolean;
    /** El fallo de esta nota: el texto se queda en el campo (diseño D11). */
    error?: string | null;
    /** Un aviso encima del campo: otra persona la cambió o la borró (D14, D15). */
    notice?: ReactNode;
    ariaLabel: string;
}

/**
 * El campo de una nota, para escribir una nueva o editar una (diseño D04, D08):
 * crece con lo escrito, Ctrl + Enter guarda, y el contador sale desde 900;
 * en 1000 no deja escribir más. Guardar no se puede con el campo vacío.
 */
export const NoteComposer = ({
    value, onChange, onSave, onCancel, saveLabel = 'Guardar', cancelLabel = 'Cancelar', placeholder,
    autoFocus = false, error = null, notice = null, ariaLabel,
}: Props) => {
    const ref = useRef<HTMLTextAreaElement>(null);
    useAutosizeTextarea(ref, value, MAX_HEIGHT);
    const canSave = value.trim().length > 0;

    // Al abrirse, el cursor al final de lo escrito (al editar, después del texto).
    useEffect(() => {
        const el = ref.current;
        if (!autoFocus || !el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
    }, [autoFocus]);

    return (
        <div className="grid gap-2">
            {notice}
            <textarea
                ref={ref}
                value={value}
                onChange={event => onChange(event.target.value)}
                onKeyDown={event => {
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && canSave) {
                        event.preventDefault();
                        onSave();
                    }
                    if (event.key === 'Escape' && onCancel) {
                        // La ficha se cierra con Esc: aquí solo cancela la nota.
                        event.stopPropagation();
                        onCancel();
                    }
                }}
                maxLength={CONTACT_NOTES_MAX}
                rows={2}
                aria-label={ariaLabel}
                placeholder={placeholder}
                className="w-full min-h-[72px] resize-none rounded-[10px] border border-brand-border-strong bg-brand-surface
                    px-3 py-2.5 text-sm leading-[1.55] text-brand-text placeholder:text-brand-subtle
                    focus:outline-none focus:border-brand-success focus:ring-[3px] focus:ring-brand-accent-soft"
            />
            {error && (
                <p className="flex gap-2 text-[12.5px] leading-[1.5] text-brand-strong">
                    <CircleAlert size={15} className="flex-none mt-0.5 text-brand-danger" />
                    <span><span className="font-semibold text-brand-danger">No se pudo guardar.</span> Tu texto sigue aquí; {error.charAt(0).toLowerCase() + error.slice(1)}</span>
                </p>
            )}
            {(canSave || onCancel) && (
                <div className="flex items-center gap-2">
                    {value.length >= NOTE_COUNTER_FROM ? (
                        <span className="font-mono text-xs font-semibold tabular-nums text-brand-warning">
                            {value.length} / {CONTACT_NOTES_MAX}
                        </span>
                    ) : (
                        <span className="hidden md:inline text-[11.5px] text-brand-subtle">Ctrl + Enter guarda</span>
                    )}
                    <span className="ml-auto flex items-center gap-1.5">
                        {onCancel && (
                            <button type="button" onClick={onCancel}
                                className="h-8 px-3 rounded-[8px] text-[13px] font-semibold text-brand-strong
                                    hover:bg-brand-raised transition-colors cursor-pointer">
                                {cancelLabel}
                            </button>
                        )}
                        <button type="button" onClick={onSave} disabled={!canSave}
                            className="h-8 px-3.5 rounded-[8px] text-[13px] font-semibold bg-brand-accent text-brand-ink
                                hover:bg-brand-accent-hover active:bg-brand-accent-active transition-colors cursor-pointer
                                disabled:bg-brand-raised disabled:text-brand-subtle disabled:cursor-not-allowed">
                            {saveLabel}
                        </button>
                    </span>
                </div>
            )}
        </div>
    );
};
