import { useState, type ReactNode } from "react";
import { ArrowRight, RotateCcw, UserRound } from "lucide-react";
import { KEYWORD_RULES_MAX, RULE_NAME_MAX, type MenuOption } from "../../../models/autoReply.model";
import type { AutoReplyForm, EditableRule } from "../../../utils/autoReplyForm";
import { formatTag, ruleName } from "../../../utils/autoReplyFlow";

/**
 * Adónde lleva una opción (diseño «Respuestas automáticas v4», 4b): una
 * respuesta que ya existe, volver al inicio, hablar con una persona o
 * «+ Nueva respuesta», que la crea ya conectada a esta opción sin salir de la
 * que se está editando. Se abre debajo de la opción.
 *
 * `sheet`: en el teléfono va en una hoja inferior (diseño, p3), con filas más
 * altas y «Crear y escribirla», que además abre la respuesta nueva.
 */
export const DestinationPicker = ({ form, self, title, onPick, onCreate, variant = 'dropdown' }: {
    form: AutoReplyForm;
    /** La respuesta que se edita: no se ofrece a sí misma. */
    self: EditableRule | null;
    /** El título de la opción: el nombre que se propone para la nueva. */
    title: string;
    onPick: (target: Pick<MenuOption, 'target' | 'ruleId'>) => void;
    onCreate: (name: string) => void;
    variant?: 'dropdown' | 'sheet';
}) => {
    // Sigue al título de la opción hasta que se escribe otro nombre.
    const [typed, setTyped] = useState<string | null>(null);
    const name = typed ?? title.trim();
    const others = form.keywordRules.filter(rule => rule !== self);
    const full = form.keywordRules.length >= KEYWORD_RULES_MAX;
    const sheet = variant === 'sheet';
    const icon = sheet ? 16 : 13;
    const submit = () => { if (name.trim() && !full) onCreate(name); };

    return (
        <div className={sheet ? 'grid' : 'border border-brand-border rounded-[10px] shadow-[0_10px_28px_rgba(14,17,22,0.1)] p-[5px] grid bg-brand-surface'}>
            {others.map(rule => (
                <Row key={rule.key} sheet={sheet} icon={<ArrowRight size={icon} strokeWidth={2.3} />} title={ruleName(form, rule)}
                    detail={formatTag(rule.options.length).toLowerCase()} onClick={() => onPick({ target: 'rule', ruleId: rule.id })} />
            ))}
            <Row sheet={sheet} separator={!sheet && others.length > 0} icon={<RotateCcw size={icon} strokeWidth={2.3} />} title="Volver al inicio" detail="la bienvenida"
                onClick={() => onPick({ target: 'start', ruleId: null })} />
            <Row sheet={sheet} icon={<UserRound size={icon} strokeWidth={2.3} className="text-brand-handoff-strong" />} title="Hablar con una persona" detail="se calla"
                onClick={() => onPick({ target: 'person', ruleId: null })} />
            <form
                onSubmit={(event) => { event.preventDefault(); submit(); }}
                className={`rounded-lg bg-brand-green-50 border border-brand-green-200 grid ${sheet ? 'mt-3 mx-4 p-3.5 gap-3 rounded-xl' : 'mt-1 p-2.5 gap-2'}`}
            >
                <span className={`font-bold text-brand-accent-strong ${sheet ? 'text-[15px]' : 'text-[13.5px]'}`}>+ Nueva respuesta</span>
                <div className={sheet ? 'grid gap-3' : 'flex gap-1.5'}>
                    <input value={name} onChange={(event) => setTyped(event.target.value)} maxLength={RULE_NAME_MAX} disabled={full}
                        aria-label="Nombre de la respuesta nueva" placeholder="Su nombre"
                        className={`flex-1 min-w-0 rounded-lg border-[1.5px] border-brand-accent-strong bg-brand-surface text-brand-text
                            focus:outline-none focus:ring-[3px] focus:ring-brand-accent-soft disabled:bg-brand-bg disabled:border-brand-border
                            ${sheet ? 'h-12 px-3 text-base rounded-[10px]' : 'h-9 px-2.5 text-sm'}`} />
                    <button type="submit" disabled={!name.trim() || full}
                        className={`flex-none rounded-lg bg-brand-deep text-white font-semibold hover:bg-brand-deep-hover cursor-pointer
                            disabled:bg-brand-raised disabled:text-brand-subtle disabled:cursor-not-allowed
                            ${sheet ? 'h-12 rounded-[10px] text-[15px]' : 'h-9 px-[13px] text-[13px]'}`}>
                        {sheet ? 'Crear y escribirla' : 'Crear'}
                    </button>
                </div>
                {(!sheet || full) && (
                    <span className="text-xs leading-[1.45] text-brand-strong">
                        {full ? `Ya hay ${KEYWORD_RULES_MAX} respuestas: es el máximo.` : 'Aparece en el lienzo ya conectada a este botón.'}
                    </span>
                )}
            </form>
        </div>
    );
};

const Row = ({ icon, title, detail, onClick, separator = false, sheet }: {
    icon: ReactNode;
    title: string;
    detail: string;
    onClick: () => void;
    separator?: boolean;
    sheet: boolean;
}) => (
    <button type="button" onClick={onClick}
        className={`flex items-center text-left text-brand-gray-600 hover:bg-brand-bg active:bg-brand-bg cursor-pointer
            ${sheet ? 'gap-3.5 min-h-[53px] px-5 border-b border-brand-raised' : 'gap-[9px] px-[9px] py-2 rounded-[7px]'}
            ${separator ? 'border-t border-brand-raised mt-1 pt-2.5' : ''}`}>
        <span className="flex-none flex">{icon}</span>
        <span className={`flex-1 min-w-0 truncate font-semibold text-brand-text ${sheet ? 'text-[15px]' : 'text-[13.5px]'}`}>{title}</span>
        {detail && <span className={`flex-none text-brand-muted ${sheet ? 'text-[13px]' : 'text-xs'}`}>{detail}</span>}
    </button>
);
