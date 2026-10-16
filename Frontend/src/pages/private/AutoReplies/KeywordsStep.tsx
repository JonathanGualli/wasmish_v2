import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, ChevronUp, Info, Plus, X } from "lucide-react";
import { KEYWORD_MAX, KEYWORD_RULES_MAX, KEYWORDS_PER_RULE_MAX, KEYWORD_REPLIES_MAX } from "../../../models/autoReply.model";
import { normalizeForMatch, ruleTitle, type EditableRule } from "../../../utils/autoReplyForm";
import type { AutoReplyEditor } from "./useAutoReplyEditor";
import { FieldError, ReplyTextField } from "./ReplyTextField";
import { Switch } from "./Switch";

/**
 * Palabras clave: lista y detalle. En escritorio se elige a la izquierda y se
 * edita a la derecha; en el teléfono, la regla abre su propia pantalla.
 * El orden se cambia con las flechas: si coinciden más de 3, salen las 3 primeras.
 */
export const KeywordsStep = ({ editor, phone }: { editor: AutoReplyEditor; phone: boolean }) => {
    const rules = editor.form.keywordRules;
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [phoneEditing, setPhoneEditing] = useState(false);
    // Tras guardar, una regla nueva cambia de clave (estrena id): se sigue en la primera.
    const selected = rules.find(rule => rule.key === selectedKey) ?? rules[0] ?? null;

    const add = () => {
        const rule = editor.addRule();
        setSelectedKey(rule.key);
        setPhoneEditing(true);
    };
    const remove = (rule: EditableRule) => {
        const index = rules.indexOf(rule);
        editor.removeRule(rule.key);
        setSelectedKey(rules[index + 1]?.key ?? rules[index - 1]?.key ?? null);
        setPhoneEditing(false);
    };
    const full = rules.length >= KEYWORD_RULES_MAX;

    const list = (
        <div className="grid gap-2 content-start min-w-0">
            <div className="text-[12.5px] leading-[1.5] text-brand-muted">
                Si coinciden más de {KEYWORD_REPLIES_MAX}, salen las {KEYWORD_REPLIES_MAX} primeras. Usa las flechas para ordenar.
            </div>
            {rules.length === 0 && (
                <div className="rounded-[10px] border border-dashed border-brand-border-strong px-4 py-5 text-[13.5px] leading-[1.55] text-brand-muted">
                    Aún no hay reglas. Empieza por lo que más te preguntan: precios, ubicación, envíos.
                </div>
            )}
            {rules.map((rule, index) => {
                const active = !phone && rule === selected;
                const issue = editor.showIssues && editor.issues.rules[rule.key];
                return (
                    <div
                        key={rule.key}
                        role="button"
                        tabIndex={0}
                        aria-current={active || undefined}
                        onClick={() => { setSelectedKey(rule.key); setPhoneEditing(true); }}
                        onKeyDown={(event) => {
                            // Solo la fila: Enter o Espacio en su interruptor lo encienden, no la eligen.
                            if (event.target !== event.currentTarget) return;
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                setSelectedKey(rule.key);
                                setPhoneEditing(true);
                            }
                        }}
                        className={`grid grid-cols-[20px_minmax(0,1fr)_auto] gap-2.5 items-center px-3 py-[11px] rounded-[10px] cursor-pointer
                            transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-accent-soft
                            ${phone ? 'min-h-16 bg-brand-surface' : ''}
                            ${active
                                ? 'border-[1.5px] border-brand-accent-strong bg-brand-green-50'
                                : issue ? 'border border-brand-danger-border bg-brand-danger-soft' : 'border border-brand-border hover:bg-brand-bg'}`}
                    >
                        <span className="font-mono tabular-nums text-[12.5px] font-semibold text-brand-muted">{index + 1}</span>
                        <div className={`min-w-0 ${rule.enabled ? '' : 'opacity-50'}`}>
                            <div className={`text-[13.5px] font-semibold truncate ${rule.keywords.length ? 'text-brand-text' : 'text-brand-subtle'}`}>
                                {ruleTitle(rule)}
                            </div>
                            <div className={`text-[12.5px] truncate mt-px ${issue ? 'text-brand-danger' : 'text-brand-muted'}`}>
                                {issue ? (issue.keywords ?? issue.text) : rule.text || 'Sin respuesta'}
                            </div>
                        </div>
                        <span className="flex items-center gap-1.5">
                            <Switch size="md" checked={rule.enabled} label={`Regla ${index + 1} encendida`}
                                onChange={(enabled) => editor.setRule(rule.key, { enabled })} />
                            {phone && <ChevronRight size={16} className="text-brand-subtle" />}
                        </span>
                    </div>
                );
            })}
            <button
                type="button"
                onClick={add}
                disabled={full}
                className="mt-0.5 h-10 rounded-[10px] border border-dashed border-brand-border-strong flex items-center justify-center gap-[7px]
                    text-sm font-semibold text-brand-strong hover:bg-brand-bg transition-colors cursor-pointer
                    disabled:cursor-not-allowed disabled:text-brand-subtle disabled:hover:bg-transparent"
            >
                <Plus size={15} strokeWidth={2.2} /> {full ? `Hasta ${KEYWORD_RULES_MAX} reglas` : 'Añadir regla'}
            </button>
        </div>
    );

    if (phone) {
        if (phoneEditing && selected) {
            return (
                <div className="grid gap-4">
                    <button type="button" onClick={() => setPhoneEditing(false)}
                        className="justify-self-start inline-flex items-center gap-1.5 text-sm font-semibold text-brand-accent-strong cursor-pointer">
                        <ArrowLeft size={16} /> Todas las reglas
                    </button>
                    <RuleEditor editor={editor} rule={selected} onRemove={remove} />
                </div>
            );
        }
        return list;
    }

    return (
        <div className="grid gap-6 @min-[640px]:grid-cols-[300px_minmax(0,1fr)] items-start">
            {list}
            {selected
                ? <div className="@min-[640px]:pl-6 @min-[640px]:border-l border-brand-raised pt-5 @min-[640px]:pt-0 border-t @min-[640px]:border-t-0 min-w-0"><RuleEditor editor={editor} rule={selected} onRemove={remove} /></div>
                : <div className="hidden @min-[640px]:block" />}
        </div>
    );
};

const RuleEditor = ({ editor, rule, onRemove }: { editor: AutoReplyEditor; rule: EditableRule; onRemove: (rule: EditableRule) => void }) => {
    const rules = editor.form.keywordRules;
    const index = rules.indexOf(rule);
    const issue = editor.showIssues ? editor.issues.rules[rule.key] : undefined;

    return (
        <div className="grid gap-4 min-w-0">
            <div className="flex items-center gap-2.5">
                <span className="text-[15px] font-bold text-brand-text">Regla {index + 1}</span>
                <span className="text-[13px] text-brand-muted">Posición {index + 1} de {rules.length}</span>
                <span className="ml-auto flex gap-1">
                    <MoveButton label="Subir" disabled={index === 0} onClick={() => editor.moveRule(rule.key, -1)}><ChevronUp size={14} strokeWidth={2.2} /></MoveButton>
                    <MoveButton label="Bajar" disabled={index === rules.length - 1} onClick={() => editor.moveRule(rule.key, 1)}><ChevronDown size={14} strokeWidth={2.2} /></MoveButton>
                </span>
                <Switch checked={rule.enabled} label="Regla encendida" onChange={(enabled) => editor.setRule(rule.key, { enabled })} />
            </div>

            <KeywordInput
                keywords={rule.keywords}
                onChange={(keywords) => editor.setRule(rule.key, { keywords })}
                error={issue?.keywords}
            />

            <ReplyTextField
                label="Responder"
                value={rule.text}
                onChange={(text) => editor.setRule(rule.key, { text })}
                error={issue?.text}
                placeholder="Lo que recibe quien pregunta esto…"
                minHeight="min-h-[120px]"
            />

            <div className="flex flex-wrap items-center gap-3">
                <span className="text-[12.5px] text-brand-muted">Ya respondida, no se repite en esa conversación durante 24 horas.</span>
                <button type="button" onClick={() => onRemove(rule)}
                    className="ml-auto text-[13.5px] font-semibold text-brand-danger hover:underline cursor-pointer">
                    Borrar regla
                </button>
            </div>
        </div>
    );
};

const MoveButton = ({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) => (
    <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick}
        className="w-[30px] h-[30px] rounded-[7px] border border-brand-border flex items-center justify-center text-brand-strong
            hover:bg-brand-bg transition-colors cursor-pointer disabled:text-brand-border-strong disabled:cursor-not-allowed disabled:hover:bg-transparent">
        {children}
    </button>
);

/** Las frases como fichas: Enter o coma para añadir; borrar con la ✕ o con Retroceso en vacío. */
const KeywordInput = ({ keywords, onChange, error }: { keywords: string[]; onChange: (keywords: string[]) => void; error?: string }) => {
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
                <label htmlFor={id} className="text-[13.5px] font-semibold text-brand-strong">Si el mensaje dice</label>
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
