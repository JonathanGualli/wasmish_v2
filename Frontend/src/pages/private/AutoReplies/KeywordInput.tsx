import { useId, useState, type KeyboardEvent } from "react";
import { Info, X } from "lucide-react";
import { KEYWORD_MAX, KEYWORDS_PER_RULE_MAX } from "../../../models/autoReply.model";
import { normalizeForMatch } from "../../../utils/autoReplyForm";
import { FieldError } from "./ReplyTextField";

/** Las frases como fichas: Enter o coma para añadir; borrar con la ✕ o con Retroceso en vacío. */
export const KeywordInput = ({ keywords, onChange, error, optional = false }: {
    keywords: string[];
    onChange: (keywords: string[]) => void;
    error?: string;
    /** En el lienzo: sin frases, solo se llega por una opción. */
    optional?: boolean;
}) => {
    const id = useId();
    const [draft, setDraft] = useState('');
    const [hint, setHint] = useState<string | null>(null);
    const full = keywords.length >= KEYWORDS_PER_RULE_MAX;

    const commit = () => {
        const phrase = draft.trim().replace(/,+$/, '').trim();
        if (!phrase) return;
        const normalized = normalizeForMatch(phrase);
        if (!normalized) {
            setHint('Una frase necesita letras o números.');
            return;
        }
        if (keywords.some(keyword => normalizeForMatch(keyword) === normalized)) {
            setHint(`«${phrase}» ya está en la regla.`);
            setDraft('');
            return;
        }
        onChange([...keywords, phrase]);
        setDraft('');
        setHint(null);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            commit();
        } else if (event.key === 'Backspace' && !draft && keywords.length) {
            onChange(keywords.slice(0, -1));
        }
    };

    return (
        <div className="grid gap-[7px]">
            <div className="flex items-baseline">
                <label htmlFor={id} className="text-[13.5px] font-semibold text-brand-strong">
                    Si el mensaje dice{optional && <span className="font-normal text-brand-muted"> · opcional</span>}
                </label>
                <span className="ml-auto font-mono tabular-nums text-[11.5px] text-brand-muted">{keywords.length} de {KEYWORDS_PER_RULE_MAX}</span>
            </div>
            <div className={`flex flex-wrap items-center gap-1.5 min-h-[46px] px-2.5 py-2 rounded-[10px] border bg-brand-surface
                transition-colors focus-within:ring-[3px]
                ${error
                    ? 'border-brand-danger ring-[3px] ring-brand-danger-border focus-within:ring-brand-danger-border'
                    : 'border-brand-border-strong focus-within:border-brand-success focus-within:ring-brand-accent-soft'}`}>
                {keywords.map((keyword, index) => (
                    <span key={`${keyword}-${index}`} className="inline-flex items-center gap-[5px] rounded-[5px] bg-brand-raised pl-[9px] pr-1.5 py-1
                        text-[13px] font-medium text-brand-strong">
                        {keyword}
                        <button type="button" aria-label={`Quitar «${keyword}»`}
                            onClick={() => onChange(keywords.filter((_, i) => i !== index))}
                            className="flex text-brand-muted hover:text-brand-text cursor-pointer">
                            <X size={11} strokeWidth={2.6} />
                        </button>
                    </span>
                ))}
                <input
                    id={id}
                    value={draft}
                    maxLength={KEYWORD_MAX}
                    disabled={full}
                    placeholder={full ? `Hasta ${KEYWORDS_PER_RULE_MAX} frases` : keywords.length ? '' : 'precio, cuánto cuesta…'}
                    onChange={(event) => { setDraft(event.target.value); setHint(null); }}
                    onKeyDown={onKeyDown}
                    onBlur={commit}
                    className="flex-1 min-w-[120px] bg-transparent px-[3px] py-0.5 text-[15px] sm:text-[13.5px] text-brand-text
                        placeholder:text-brand-subtle focus:outline-none disabled:cursor-not-allowed"
                />
                {!full && <span className="hidden sm:inline ml-auto text-xs text-brand-subtle">Enter para añadir</span>}
            </div>
            {error ? <FieldError>{error}</FieldError> : hint && <FieldError>{hint}</FieldError>}
            <div className="flex gap-2 items-start text-[12.5px] leading-[1.5] text-brand-gray-600">
                <Info size={14} className="flex-none mt-0.5 text-brand-muted" />
                <span>
                    Da igual mayúsculas y tildes, pero busca <b className="font-semibold text-brand-text">palabras completas</b>:
                    {' '}«precio» no encuentra «preciosa» ni «precios». Añade cada variante.
                </span>
            </div>
        </div>
    );
};
