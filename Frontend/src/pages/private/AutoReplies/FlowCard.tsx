import type { PointerEvent } from "react";
import { CircleHelp, MessageSquare, RotateCcw, Undo2, UserRound } from "lucide-react";
import type { CardPosition, MenuOption } from "../../../models/autoReply.model";
import { CARD_HEADER, CARD_TEXT, CARD_WIDTH, type FlowNode } from "../../../utils/autoReplyFlow";

/** Cómo se ve una opción en la tarjeta: con su puerto (lleva línea) o con una etiqueta. */
export interface CardOption {
    option: MenuOption;
    /** Lleva línea a una tarjeta de más a la derecha. */
    forward: boolean;
    /** La etiqueta de las que no llevan línea: «Inicio», «Persona» o el nombre de la respuesta. */
    chip: string;
    highlighted: boolean;
}

export type CardState = 'idle' | 'selected' | 'trace' | 'error';

/**
 * Una tarjeta del lienzo (diseño «Respuestas automáticas v4», 4a): la cabecera
 * (por donde se arrastra), un trozo del texto y las opciones. «Una persona» es
 * ámbar; una a la que no se llega, punteada; con errores, en rojo y diciendo
 * cuántos. Seleccionada, con el borde verde y su halo.
 */
export const FlowCard = ({ node, position, options, tag, tagTone, foot, state, faded, inPort, inHighlighted, onHeaderPointerDown, onSelect }: {
    node: FlowNode;
    position: CardPosition;
    options: CardOption[];
    tag: string;
    tagTone: 'muted' | 'danger' | 'warning' | 'handoff';
    foot: string | null;
    state: CardState;
    /** Apagada: se ve a medias. */
    faded: boolean;
    inPort: boolean;
    inHighlighted: boolean;
    onHeaderPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
    onSelect: () => void;
}) => {
    const handoff = node.kind === 'handoff';
    const unreachable = tagTone === 'warning';
    const Icon = handoff ? UserRound : node.kind === 'fallback' ? CircleHelp : MessageSquare;
    const border = state === 'selected' ? 'border-2 border-brand-accent-strong'
        : state === 'error' ? 'border-[1.5px] border-brand-danger'
        : state === 'trace' ? 'border-[1.5px] border-brand-success'
        : unreachable ? 'border-[1.5px] border-dashed border-brand-warning'
        : handoff ? 'border border-brand-handoff-border' : 'border border-brand-border';
    return (
        <div
            data-flow-card
            onClick={(event) => { event.stopPropagation(); onSelect(); }}
            style={{ left: position.x, top: position.y, width: CARD_WIDTH }}
            className={`absolute box-border bg-brand-surface rounded-xl cursor-pointer ${border} ${faded ? 'opacity-50' : ''}
                ${state === 'selected' ? 'z-[2] shadow-[0_0_0_4px_var(--color-brand-accent-soft),0_8px_24px_rgba(14,17,22,0.08)]' : 'shadow-[0_1px_3px_rgba(14,17,22,0.06)]'}`}
        >
            <div onPointerDown={onHeaderPointerDown} style={{ height: CARD_HEADER }}
                className={`box-border pl-3.5 pr-3 flex items-center gap-2 border-b border-brand-raised rounded-t-xl cursor-grab active:cursor-grabbing touch-none select-none
                    ${state === 'error' ? 'bg-brand-danger-soft' : handoff ? 'bg-brand-handoff-unseen' : 'bg-brand-surface'}`}>
                <span className={`flex-none w-[22px] h-[22px] rounded-md flex items-center justify-center
                    ${handoff ? 'bg-brand-handoff-soft text-brand-handoff-strong'
                        : node.kind === 'welcome' ? 'bg-brand-deep text-brand-accent' : 'bg-brand-raised text-brand-gray-600'}`}>
                    <Icon size={12} strokeWidth={2.4} />
                </span>
                <span className="flex-1 min-w-0 truncate text-[14.5px] font-bold tracking-[-0.01em] text-brand-text">{node.name}</span>
                {tag && (
                    <span className={`flex-none text-[11.5px] font-semibold
                        ${tagTone === 'danger' ? 'text-brand-danger' : tagTone === 'warning' ? 'text-brand-warning'
                            : tagTone === 'handoff' ? 'text-brand-handoff-text' : 'text-brand-muted'}`}>{tag}</span>
                )}
            </div>
            <div style={{ height: CARD_TEXT }} className="box-border px-3.5 pt-[9px] overflow-hidden text-[13px] leading-[1.45] text-brand-gray-600 line-clamp-3">
                {node.text.trim() || <span className="text-brand-subtle">Sin texto todavía</span>}
            </div>
            {options.length > 0 && (
                <div className="px-2.5 pt-1.5 pb-3 grid gap-1">
                    {options.map(({ option, forward, chip, highlighted }, index) => (
                        <div key={index} className={`relative h-[30px] box-border rounded-[7px] border px-2.5 flex items-center gap-2
                            ${highlighted ? 'bg-brand-green-50 border-brand-green-200' : 'bg-brand-bg border-brand-raised'}`}>
                            <span className="flex-1 min-w-0 truncate text-[13.5px] font-semibold text-brand-text">
                                {option.title.trim() || <span className="text-brand-subtle font-medium">Sin título</span>}
                            </span>
                            {!forward && chip && <OptionChip target={option.target} label={chip} />}
                            {forward && (
                                <span className={`absolute -right-[15px] top-[9px] w-2.5 h-2.5 rounded-full border-2 border-brand-surface box-content
                                    ${highlighted ? 'bg-brand-accent-strong' : 'bg-brand-subtle'}`} />
                            )}
                        </div>
                    ))}
                </div>
            )}
            {foot && (
                <div className={`px-3.5 pb-3 text-xs leading-[1.45] ${handoff ? 'text-brand-handoff-text' : 'text-brand-warning'}`}>{foot}</div>
            )}
            {inPort && (
                <span className={`absolute -left-1.5 top-[17px] w-2 h-2 rounded-full bg-brand-surface border-2
                    ${inHighlighted ? 'border-brand-accent-strong' : 'border-brand-subtle'}`} />
            )}
        </div>
    );
};

/** La etiqueta de una opción que no lleva línea: vuelve, va al inicio o pide una persona. */
export const OptionChip = ({ target, label }: { target: MenuOption['target']; label: string }) => {
    const Icon = target === 'person' ? UserRound : target === 'start' ? RotateCcw : Undo2;
    return (
        <span className={`flex-none max-w-[110px] inline-flex items-center gap-1 rounded-full pl-1.5 pr-2 py-0.5 text-[11.5px] font-semibold
            ${target === 'person' ? 'bg-brand-handoff-soft text-brand-handoff-text' : 'bg-brand-raised text-brand-strong'}`}>
            <Icon size={10} strokeWidth={2.6} className="flex-none" />
            <span className="truncate">{label}</span>
        </span>
    );
};
