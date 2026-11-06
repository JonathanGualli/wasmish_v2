import { useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Maximize, Minus, Plus } from "lucide-react";
import { KEYWORD_RULES_MAX, type CardPosition } from "../../../models/autoReply.model";
import {
    CARD_WIDTH, cardHeight, flowColumns, flowLayout, flowNodes, flowWarnings, incomingTo, inPort, isForward,
    optionNode, optionPort, ruleName, unreachableReason, type FlowNode, type NodeKey,
} from "../../../utils/autoReplyFlow";
import type { AutoReplyEditor } from "./useAutoReplyEditor";
import { FlowCard, type CardOption, type CardState } from "./FlowCard";
import { nodeIssueCount, nodeTag } from "./flowIssues";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const DRAG_THRESHOLD = 4;
const MARGIN = 120;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** La nota al pie: cuántos botones llevan a «Una persona», o por qué no se llega a una respuesta. */
const footOf = (form: AutoReplyEditor['form'], node: FlowNode) => {
    if (node.kind === 'handoff') {
        const count = incomingTo(form, 'handoff').length;
        return `${count === 1 ? 'Llega 1 botón' : `Llegan ${count} botones`}. Después el bot se calla y avisa al equipo.`;
    }
    return node.rule ? unreachableReason(form, node.rule) : null;
};

type Gesture =
    | { kind: 'card'; node: NodeKey; startX: number; startY: number; origin: CardPosition; moved: boolean }
    | { kind: 'pan'; startX: number; startY: number; scrollLeft: number; scrollTop: number; moved: boolean };

/**
 * El lienzo (diseño «Respuestas automáticas v4», 4a): cada respuesta es una
 * tarjeta, y cada opción que avanza sale con su línea. Las tarjetas se
 * arrastran por la cabecera y su sitio se guarda con lo demás (decisión de
 * Jonathan del 2026-11-05); una sin sitio guardado se coloca sola en su
 * columna. Se desplaza arrastrando el fondo o con la rueda, y el zoom va de
 * 50 % a 150 %. Tocar una tarjeta la abre en «Editar»; el fondo, la suelta.
 */
export const FlowCanvas = ({ editor, selected, trace, onSelect, onAddRule, cover }: {
    editor: AutoReplyEditor;
    selected: NodeKey | null;
    /** Las tarjetas por las que pasó «Probar». */
    trace: Set<NodeKey>;
    onSelect: (node: NodeKey | null) => void;
    onAddRule: () => void;
    /** Lo que va encima de todo el lienzo: el asistente de la primera vez (diseño 4f). */
    cover?: ReactNode;
}) => {
    const { form } = editor;
    const scrollRef = useRef<HTMLDivElement>(null);
    const gesture = useRef<Gesture | null>(null);
    const [zoom, setZoom] = useState(1);
    const [dragging, setDragging] = useState<{ node: NodeKey; position: CardPosition } | null>(null);
    const [warningsOpen, setWarningsOpen] = useState(false);

    // Todo sale del formulario: cada cambio recoloca lo que no tiene sitio guardado.
    const { nodes, columns, feet, heights, layout, warnings } = useMemo(() => {
        const nodes = flowNodes(form);
        const columns = flowColumns(form);
        const feet = new Map(nodes.map(node => [node.key, footOf(form, node)]));
        const heights = new Map(nodes.map(node => [node.key, cardHeight(node, Boolean(feet.get(node.key)))]));
        return { nodes, columns, feet, heights, layout: flowLayout(nodes, columns, heights), warnings: flowWarnings(form) };
    }, [form]);

    const positionOf = (key: NodeKey) => (dragging?.node === key ? dragging.position : layout.get(key) ?? { x: 0, y: 0 });

    // Lo que está relacionado con la tarjeta abierta (sus líneas y las que le llegan) se resalta.
    const related = (from: NodeKey, to: NodeKey | null) => selected !== null && (from === selected || to === selected);

    const edges = nodes.flatMap(node => node.options.flatMap((option, index) => {
        const to = optionNode(form, option);
        if (!to || !isForward(columns, node.key, to)) return [];
        const start = optionPort(positionOf(node.key), index);
        const end = inPort(positionOf(to));
        const highlighted = related(node.key, to);
        return [{ key: `${node.key}-${index}`, start, end, highlighted }];
    }));

    const cardOptions = (node: FlowNode): CardOption[] => node.options.map(option => {
        const to = optionNode(form, option);
        const forward = isForward(columns, node.key, to);
        const target = option.target === 'rule' ? form.keywordRules.find(rule => rule.id === option.ruleId) : undefined;
        const chip = option.target === 'person' ? 'Persona' : option.target === 'start' ? 'Inicio' : target ? ruleName(form, target) : '';
        return { option, forward, chip, highlighted: forward && related(node.key, to) };
    });

    // El tamaño del mundo: lo que ocupan las tarjetas, con margen para seguir arrastrando.
    const bounds = nodes.reduce((acc, node) => {
        const position = positionOf(node.key);
        return { width: Math.max(acc.width, position.x + CARD_WIDTH + MARGIN), height: Math.max(acc.height, position.y + (heights.get(node.key) ?? 0) + MARGIN) };
    }, { width: 0, height: 0 });

    const fit = () => {
        const el = scrollRef.current;
        if (!el || bounds.width === 0) return;
        setZoom(clamp(Math.min(el.clientWidth / bounds.width, el.clientHeight / bounds.height), ZOOM_MIN, 1));
        el.scrollTo({ left: 0, top: 0 });
    };

    // Mientras se guarda no se mueve nada: la respuesta reemplaza el formulario
    // y lo movido se perdería (revisión de Codex del PR #186, 1). Tocar sí abre la tarjeta.
    const onCardPointerDown = (node: NodeKey) => (event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        if (editor.isSaving) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        gesture.current = { kind: 'card', node, startX: event.clientX, startY: event.clientY, origin: positionOf(node), moved: false };
    };
    const onBackgroundPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        const el = scrollRef.current;
        if (event.button !== 0 || !el || (event.target as HTMLElement).closest('[data-flow-card],[data-flow-overlay]')) return;
        el.setPointerCapture(event.pointerId);
        gesture.current = { kind: 'pan', startX: event.clientX, startY: event.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop, moved: false };
    };
    const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
        const current = gesture.current;
        if (!current) return;
        const dx = event.clientX - current.startX;
        const dy = event.clientY - current.startY;
        if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        current.moved = true;
        if (current.kind === 'card') {
            setDragging({ node: current.node, position: { x: Math.max(0, current.origin.x + dx / zoom), y: Math.max(0, current.origin.y + dy / zoom) } });
        } else if (scrollRef.current) {
            scrollRef.current.scrollLeft = current.scrollLeft - dx;
            scrollRef.current.scrollTop = current.scrollTop - dy;
        }
    };
    const onPointerUp = () => {
        const current = gesture.current;
        gesture.current = null;
        if (!current) return;
        if (current.kind === 'card') {
            // Un arrastre que empezó antes de guardar tampoco se aplica.
            if (current.moved && dragging) {
                if (!editor.isSaving) editor.setPositions(new Map([...layout, [dragging.node, dragging.position]]));
            }
            else onSelect(current.node);
            setDragging(null);
        } else if (!current.moved) {
            onSelect(null);
        }
    };

    return (
        <div className="relative min-w-0 min-h-0 overflow-hidden bg-brand-bg">
            <div
                ref={scrollRef}
                onPointerDown={onBackgroundPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => { gesture.current = null; setDragging(null); }}
                className="absolute inset-0 overflow-auto [scrollbar-width:thin] cursor-default
                    bg-[radial-gradient(#d9dee3_1px,transparent_1px)] [background-size:18px_18px]"
            >
                <div style={{ width: bounds.width * zoom, height: bounds.height * zoom }} className="relative">
                    <div style={{ width: bounds.width, height: bounds.height, transform: `scale(${zoom})` }} className="absolute left-0 top-0 origin-top-left">
                        <svg width={bounds.width} height={bounds.height} className="absolute left-0 top-0 overflow-visible pointer-events-none">
                            {edges.map(edge => (
                                <g key={edge.key} className={edge.highlighted ? 'text-brand-accent-strong' : 'text-brand-subtle'}>
                                    <path
                                        d={`M ${edge.start.x} ${edge.start.y} C ${edge.start.x + 40} ${edge.start.y}, ${edge.end.x - 40} ${edge.end.y}, ${edge.end.x} ${edge.end.y}`}
                                        fill="none" stroke="currentColor" strokeWidth={edge.highlighted ? 2.4 : 1.6} strokeLinecap="round"
                                    />
                                    <circle cx={edge.end.x} cy={edge.end.y} r={4} fill="currentColor" />
                                </g>
                            ))}
                        </svg>
                        {nodes.map(node => {
                            const issues = nodeIssueCount(editor, node.key);
                            const foot = feet.get(node.key) ?? null;
                            const welcomeOff = node.kind === 'welcome' && !node.enabled;
                            const state: CardState = selected === node.key ? 'selected'
                                : issues > 0 && editor.showIssues ? 'error'
                                : trace.has(node.key) ? 'trace' : 'idle';
                            const incoming = incomingTo(form, node.key);
                            const { tag, tone } = nodeTag(editor, node);
                            return (
                                <FlowCard
                                    key={node.key}
                                    node={node}
                                    position={positionOf(node.key)}
                                    options={cardOptions(node)}
                                    tag={tag}
                                    tagTone={tone}
                                    foot={foot}
                                    state={state}
                                    faded={welcomeOff || (node.kind !== 'handoff' && !node.enabled && !foot)}
                                    inPort={(columns.get(node.key) ?? 0) > 0 && node.kind !== 'handoff'}
                                    inHighlighted={incoming.some(({ from }) => related(from, node.key) && isForward(columns, from, node.key))}
                                    onHeaderPointerDown={onCardPointerDown(node.key)}
                                    onSelect={() => onSelect(node.key)}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>

            <div data-flow-overlay className="absolute top-3.5 left-4 z-[3] flex gap-2">
                <button type="button" onClick={onAddRule} disabled={editor.isSaving || form.keywordRules.length >= KEYWORD_RULES_MAX}
                    title={form.keywordRules.length >= KEYWORD_RULES_MAX ? `Hasta ${KEYWORD_RULES_MAX} respuestas` : undefined}
                    className="h-[34px] px-3 rounded-[9px] bg-brand-surface border border-brand-border flex items-center gap-[7px]
                        text-[13px] font-semibold text-brand-strong hover:bg-brand-bg cursor-pointer transition-colors
                        disabled:cursor-not-allowed disabled:text-brand-subtle disabled:hover:bg-brand-surface">
                    <Plus size={14} strokeWidth={2.4} />Nueva respuesta
                </button>
                <span className="h-[34px] px-3 rounded-[9px] bg-brand-surface border border-brand-border flex items-center font-mono tabular-nums text-xs text-brand-gray-600">
                    {form.keywordRules.length} de {KEYWORD_RULES_MAX}
                </span>
            </div>

            {warnings.length > 0 && (
                <div data-flow-overlay className="absolute top-3.5 right-4 z-[7] grid gap-1.5 justify-items-end">
                    <button type="button" onClick={() => setWarningsOpen(open => !open)} aria-expanded={warningsOpen}
                        className="h-[34px] pl-2.5 pr-3 rounded-[9px] bg-brand-warning-soft border border-brand-border flex items-center gap-[7px]
                            text-[13px] font-semibold text-brand-warning cursor-pointer">
                        <AlertTriangle size={14} strokeWidth={2.2} />
                        {warnings.length === 1 ? '1 aviso' : `${warnings.length} avisos`}
                        {warningsOpen ? <ChevronUp size={12} strokeWidth={2.2} /> : <ChevronDown size={12} strokeWidth={2.2} />}
                    </button>
                    {warningsOpen && (
                        <div className="w-[360px] grid gap-1.5 p-1.5 rounded-xl bg-brand-surface border border-brand-border shadow-[0_14px_36px_rgba(14,17,22,0.14)]">
                            {warnings.map(warning => (
                                <div key={warning.title} className="flex gap-[9px] items-start px-3 py-[9px] rounded-lg bg-brand-warning-soft text-[12.5px] leading-[1.45] text-brand-strong">
                                    <AlertTriangle size={14} strokeWidth={2.2} className="flex-none mt-0.5 text-brand-warning" />
                                    <span><b className="font-semibold">{warning.title}</b> {warning.detail}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div data-flow-overlay className="absolute left-4 bottom-4 z-[3] grid bg-brand-surface border border-brand-border rounded-[9px] overflow-hidden">
                <ZoomButton label="Acercar" onClick={() => setZoom(value => clamp(value + 0.1, ZOOM_MIN, ZOOM_MAX))}><Plus size={14} strokeWidth={2.4} /></ZoomButton>
                <ZoomButton label="Alejar" onClick={() => setZoom(value => clamp(value - 0.1, ZOOM_MIN, ZOOM_MAX))}><Minus size={14} strokeWidth={2.4} /></ZoomButton>
                <ZoomButton label="Ver todo" onClick={fit} last><Maximize size={14} strokeWidth={2.2} /></ZoomButton>
            </div>
            {cover}
        </div>
    );
};

const ZoomButton = ({ label, onClick, last = false, children }: { label: string; onClick: () => void; last?: boolean; children: ReactNode }) => (
    <button type="button" onClick={onClick} title={label} aria-label={label}
        className={`w-[34px] h-8 flex items-center justify-center text-brand-strong hover:bg-brand-bg cursor-pointer ${last ? '' : 'border-b border-brand-raised'}`}>
        {children}
    </button>
);
