import { useId, useRef, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { useAutosizeTextarea } from "../../../hooks/useAutosizeTextarea";
import { AUTO_REPLY_TEXT_MAX } from "../../../models/autoReply.model";

/** El error de un campo, en rojo, debajo de él. */
export const FieldError = ({ children }: { children: ReactNode }) => (
    <div role="alert" className="flex items-center gap-1.5 text-[12.5px] text-brand-danger">
        <AlertCircle size={13} className="flex-none" />{children}
    </div>
);

/** Un texto de respuesta: crece con lo escrito y cuenta los caracteres (hasta 800). */
export const ReplyTextField = ({ label, badge, value, onChange, error, help, placeholder, minHeight = 'min-h-[150px]' }: {
    label: string;
    /** Junto al label, p. ej. «Ejemplo · edítalo». */
    badge?: string;
    value: string;
    onChange: (value: string) => void;
    error?: string;
    help?: ReactNode;
    placeholder?: string;
    minHeight?: string;
}) => {
    const id = useId();
    const ref = useRef<HTMLTextAreaElement>(null);
    useAutosizeTextarea(ref, value, 360);
    const over = value.length > AUTO_REPLY_TEXT_MAX;

    return (
        <div className="grid gap-2 min-w-0">
            <div className="flex items-center gap-2">
                <label htmlFor={id} className="text-[13.5px] font-semibold text-brand-strong">{label}</label>
                {badge && (
                    <span className="rounded-full bg-brand-accent-soft text-brand-accent-strong px-2 py-[3px]
                        text-[11px] font-bold uppercase tracking-[0.05em]">{badge}</span>
                )}
            </div>
            <div className={`relative rounded-[10px] border bg-brand-surface transition-colors
                focus-within:ring-[3px]
                ${error
                    ? 'border-brand-danger ring-[3px] ring-brand-danger-border focus-within:ring-brand-danger-border'
                    : 'border-brand-border-strong focus-within:border-brand-success focus-within:ring-brand-accent-soft'}`}>
                <textarea
                    ref={ref}
                    id={id}
                    value={value}
                    placeholder={placeholder}
                    aria-invalid={Boolean(error) || undefined}
                    onChange={(event) => onChange(event.target.value)}
                    className={`block w-full resize-none bg-transparent rounded-[10px] px-[15px] pt-[13px] pb-8
                        text-[15px] sm:text-[14.5px] leading-[1.6] text-brand-text placeholder:text-brand-subtle
                        focus:outline-none ${minHeight}`}
                />
                <span className={`absolute right-3 bottom-2.5 font-mono tabular-nums text-[11.5px] pointer-events-none
                    ${over ? 'text-brand-danger font-semibold' : 'text-brand-muted'}`}>
                    {value.length} / {AUTO_REPLY_TEXT_MAX}
                </span>
            </div>
            {error ? <FieldError>{error}</FieldError> : help && <div className="text-[13px] text-brand-muted">{help}</div>}
        </div>
    );
};
