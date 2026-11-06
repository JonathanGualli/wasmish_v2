import { useState } from "react";
import { ArrowRight, RotateCcw, UserRound } from "lucide-react";
import { KEYWORD_RULES_MAX, RULE_NAME_MAX, type MenuOption } from "../../../models/autoReply.model";
import type { AutoReplyForm, EditableRule } from "../../../utils/autoReplyForm";
import { formatTag, ruleName } from "../../../utils/autoReplyFlow";

/**
 * Adónde lleva una opción (diseño «Respuestas automáticas v4», 4b): una
 * respuesta que ya existe, volver al inicio, hablar con una persona o
 * «+ Nueva respuesta», que la crea ya conectada a esta opción sin salir de la
 * que se está editando. Se abre debajo de la opción.
 */
export const DestinationPicker = ({ form, self, title, onPick, onCreate }: {
    form: AutoReplyForm;
    /** La respuesta que se edita: no se ofrece a sí misma. */
    self: EditableRule | null;
    /** El título de la opción: el nombre que se propone para la nueva. */
    title: string;
    onPick: (target: Pick<MenuOption, 'target' | 'ruleId'>) => void;
    onCreate: (name: string) => void;
}) => {
    // Sigue al título de la opción hasta que se escribe otro nombre.
    const [typed, setTyped] = useState<string | null>(null);
    const name = typed ?? title.trim();
    const others = form.keywordRules.filter(rule => rule !== self);
    const full = form.keywordRules.length >= KEYWORD_RULES_MAX;

    return (
        <div className="border border-brand-border rounded-[10px] shadow-[0_10px_28px_rgba(14,17,22,0.1)] p-[5px] grid bg-brand-surface">
            {others.map(rule => (
                <Row key={rule.key} icon={<ArrowRight size={13} strokeWidth={2.3} />} title={ruleName(form, rule)}
                    detail={formatTag(rule.options.length).toLowerCase()} onClick={() => onPick({ target: 'rule', ruleId: rule.id })} />
            ))}
            <Row separator={others.length > 0} icon={<RotateCcw size={13} strokeWidth={2.3} />} title="Volver al inicio" detail="la bienvenida"
                onClick={() => onPick({ target: 'start', ruleId: null })} />
            <Row icon={<UserRound size={13} strokeWidth={2.3} className="text-brand-handoff-strong" />} title="Hablar con una persona" detail="se calla"
                onClick={() => onPick({ target: 'person', ruleId: null })} />
            <form
                onSubmit={(event) => { event.preventDefault(); if (name.trim() && !full) onCreate(name); }}
                className="mt-1 rounded-lg bg-brand-green-50 border border-brand-green-200 p-2.5 grid gap-2"
            >
                <span className="text-[13.5px] font-bold text-brand-accent-strong">+ Nueva respuesta</span>
                <div className="flex gap-1.5">
                    <input value={name} onChange={(event) => setTyped(event.target.value)} maxLength={RULE_NAME_MAX} disabled={full}
                        aria-label="Nombre de la respuesta nueva" placeholder="Su nombre"
                        className="flex-1 min-w-0 h-9 rounded-lg border-[1.5px] border-brand-accent-strong bg-brand-surface px-2.5 text-sm text-brand-text
                            focus:outline-none focus:ring-[3px] focus:ring-brand-accent-soft disabled:bg-brand-bg disabled:border-brand-border" />
                    <button type="submit" disabled={!name.trim() || full}
                        className="flex-none h-9 px-[13px] rounded-lg bg-brand-deep text-white text-[13px] font-semibold hover:bg-brand-deep-hover cursor-pointer
                            disabled:bg-brand-raised disabled:text-brand-subtle disabled:cursor-not-allowed">
                        Crear
                    </button>
                </div>
                <span className="text-xs leading-[1.45] text-brand-strong">
                    {full ? `Ya hay ${KEYWORD_RULES_MAX} respuestas: es el máximo.` : 'Aparece en el lienzo ya conectada a este botón.'}
                </span>
            </form>
        </div>
    );
};

const Row = ({ icon, title, detail, onClick, separator = false }: {
    icon: React.ReactNode;
    title: string;
    detail: string;
    onClick: () => void;
    separator?: boolean;
}) => (
    <button type="button" onClick={onClick}
        className={`flex items-center gap-[9px] px-[9px] py-2 rounded-[7px] text-left text-brand-gray-600 hover:bg-brand-bg cursor-pointer
            ${separator ? 'border-t border-brand-raised mt-1 pt-2.5' : ''}`}>
        <span className="flex-none flex">{icon}</span>
        <span className="flex-1 min-w-0 truncate text-[13.5px] font-semibold text-brand-text">{title}</span>
        {detail && <span className="flex-none text-xs text-brand-muted">{detail}</span>}
    </button>
);
