import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, ChevronRight, CircleHelp, MessageSquare, Send, UserRound } from "lucide-react";
import { CustomButton } from "../../../components/Button/Button";
import { Callout } from "../../../components/Callout/Callout";
import { KEYWORD_RULES_MAX, OPTION_TITLE_MAX, OPTIONS_MAX, type MenuOption } from "../../../models/autoReply.model";
import { scheduleSummary, silenceSummary } from "../../../utils/autoReplyForm";
import { flowNodes, incomingTo, ruleName, ruleNode, type FlowNode, type NodeKey } from "../../../utils/autoReplyFlow";
import type { AutoReplyEditor, OptionsOwner } from "./useAutoReplyEditor";
import { ReplyEditor } from "./ReplyEditor";
import { OutOfHoursStep } from "./OutOfHoursStep";
import { SilenceStep } from "./SilenceStep";
import { DestinationPicker } from "./DestinationPicker";
import { OptionChip } from "./FlowCard";
import { FieldError } from "./ReplyTextField";
import { StatusDot } from "./StatusDot";
import { Switch } from "./Switch";
import { nodeIssueCount, nodeTag, type NodeTagTone } from "./flowIssues";

/*
 * «Respuestas automáticas» por debajo de 1024 px (diseño «Respuestas
 * automáticas v4 - Lienzo», p1 a p3): no hay lienzo, se navega. Una pila de
 * pantallas: el menú (la lista de respuestas y los ajustes; el diseño no la
 * dibuja y se hizo con las piezas de la página por pasos de antes, decisión
 * de Jonathan), una respuesta con sus opciones (p1), editarla (p2) y una
 * opción con su destino en una hoja (p3). Se edita y se guarda igual que en
 * el lienzo (`useAutoReplyEditor`); las posiciones del lienzo no se tocan.
 * Mientras se guarda, nada que cambie el formulario está activo (se navega).
 */

type Screen =
    | { kind: 'menu' }
    | { kind: 'reply'; node: NodeKey }
    | { kind: 'edit'; node: NodeKey }
    | { kind: 'option'; node: NodeKey; index: number }
    | { kind: 'outOfHours' }
    | { kind: 'silence' };

const MENU: Screen = { kind: 'menu' };

const ownerOf = (node: FlowNode): OptionsOwner | null =>
    node.kind === 'welcome' ? 'welcome' : node.kind === 'fallback' ? 'fallback' : node.rule ? node.rule.key : null;

const TAG_TONE: Record<NodeTagTone, string> = {
    muted: 'text-brand-muted', danger: 'text-brand-danger', warning: 'text-brand-warning', handoff: 'text-brand-handoff-text',
};

export const PhoneFlow = ({ editor, onMasterSwitch, outdated, onTest }: {
    editor: AutoReplyEditor;
    onMasterSwitch: (enabled: boolean) => void;
    /** El `PUT` dio 409 `auto_replies_outdated`: hay que recargar antes de guardar. */
    outdated: boolean;
    onTest: () => void;
}) => {
    const [stack, setStack] = useState<Screen[]>([MENU]);
    const nodes = useMemo(() => flowNodes(editor.form), [editor.form]);
    const nodeOf = (key: NodeKey) => nodes.find(node => node.key === key) ?? null;

    // Lo que se borró (una respuesta, una opción) deja de estar: se vuelve a la última pantalla que sigue.
    const exists = (screen: Screen) => {
        if (!('node' in screen)) return true;
        const node = nodeOf(screen.node);
        return node !== null && (screen.kind !== 'option' || screen.index < node.options.length);
    };
    const cut = stack.findIndex(screen => !exists(screen));
    const screens = cut < 0 ? stack : stack.slice(0, cut);
    const screen = screens[screens.length - 1];

    // Cada pantalla empieza arriba: si no, se abre con el desplazamiento de la anterior.
    const topRef = useRef<HTMLDivElement>(null);
    const screenId = JSON.stringify(screen);
    useEffect(() => { topRef.current?.scrollIntoView({ block: 'start' }); }, [screenId]);

    const push = (next: Screen) => setStack([...screens, next]);
    const back = () => setStack(screens.length > 1 ? screens.slice(0, -1) : [MENU]);
    const backTo = (index: number) => setStack(screens.slice(0, index + 1));

    /** Con errores, no guarda y abre lo primero que tiene uno. */
    const save = () => {
        editor.saveAll();
        if (editor.issueTotal === 0) return;
        const first = nodes.find(node => nodeIssueCount(editor, node.key) > 0);
        if (first) setStack([MENU, { kind: 'edit', node: first.key }]);
        else if (editor.counts.outOfHours > 0) setStack([MENU, { kind: 'outOfHours' }]);
    };

    const notices = outdated ? (
        <Callout tone="warning" icon={<AlertCircle size={16} />}
            action={<CustomButton variant="secondary" onClick={() => window.location.reload()}>Recargar</CustomButton>}>
            <b className="font-semibold text-brand-text">La página de respuestas automáticas cambió: recárgala.</b>{' '}
            Para no borrar los menús, no se guardó nada.
        </Callout>
    ) : editor.saveBlocked && (
        <Callout tone="danger" icon={<AlertCircle size={16} />}>
            <b className="font-semibold text-brand-text">No se guardó.</b>{' '}
            Hay {editor.issueTotal} {editor.issueTotal === 1 ? 'cosa' : 'cosas'} por corregir, marcadas en rojo.
        </Callout>
    );

    const testButton = <CustomButton variant="outline" onClick={onTest}><Send size={16} /> Probar</CustomButton>;
    const saveButton = <CustomButton onClick={save} isLoading={editor.isSaving} disabled={!editor.dirty || outdated}>Guardar</CustomButton>;

    let content: ReactNode;
    let bar: ReactNode = <><div className="flex-1 h-12">{testButton}</div><div className="flex-1 h-12">{saveButton}</div></>;

    if (screen.kind === 'menu') {
        content = <MenuScreen editor={editor} nodes={nodes} onMasterSwitch={onMasterSwitch} notices={notices} onOpen={push} />;
    } else if (screen.kind === 'reply') {
        const node = nodeOf(screen.node)!;
        // La ruta: el menú y las respuestas por las que se entró hasta esta.
        const crumbs = screens.map((item, index) => ({ item, index })).filter(({ item }) => item.kind === 'reply');
        content = (
            <ReplyScreen editor={editor} node={node} notices={notices}
                crumbs={[{ label: 'Menú', onClick: () => backTo(0) }, ...crumbs.map(({ item, index }) => ({
                    label: nodeOf((item as { node: NodeKey }).node)?.name ?? '', onClick: () => backTo(index),
                }))]}
                onEnter={(key) => push({ kind: 'reply', node: key })}
                onHome={() => setStack([MENU, { kind: 'reply', node: 'welcome' }])}
                onOpenOption={(index) => push({ kind: 'option', node: node.key, index })} />
        );
        bar = (
            <>
                <div className="flex-1 h-12"><CustomButton variant="outline" onClick={() => push({ kind: 'edit', node: node.key })}>Editar</CustomButton></div>
                <div className="flex-1 h-12">{testButton}</div>
                <div className="flex-1 h-12">{saveButton}</div>
            </>
        );
    } else if (screen.kind === 'edit') {
        const node = nodeOf(screen.node)!;
        content = (
            <>
                <ScreenHeader title={`Editar «${node.name}»`} onBack={back} />
                {notices}
                <div className="bg-brand-surface border border-brand-border rounded-[14px] overflow-hidden grid">
                    <ReplyEditor key={node.key} editor={editor} node={node}
                        onSelect={(next) => setStack(next ? [MENU, { kind: 'edit', node: next }] : [MENU])}
                        onOpenOption={(index) => push({ kind: 'option', node: node.key, index })} />
                </div>
            </>
        );
    } else if (screen.kind === 'option') {
        const node = nodeOf(screen.node)!;
        content = (
            <OptionScreen editor={editor} node={node} index={screen.index} onBack={back}
                onCreated={(created) => setStack([...screens.slice(0, -1), { kind: 'edit', node: created }])} />
        );
    } else {
        const outOfHours = screen.kind === 'outOfHours';
        content = (
            <>
                <ScreenHeader title={outOfHours ? 'Fuera de horario' : 'Cuándo se calla'} onBack={back}
                    right={outOfHours && (
                        <Switch size="lg" checked={editor.form.outOfHours.enabled} disabled={editor.isSaving} label="Fuera de horario encendido"
                            onChange={(enabled) => editor.setOutOfHours({ enabled })} />
                    )} />
                <p className="-mt-1 px-0.5 text-sm leading-[1.5] text-brand-gray-600">
                    {outOfHours ? 'A quien escribe con el negocio cerrado. Se suma a lo que responda el menú.' : 'Para que no conteste encima de una persona ni repita lo mismo.'}
                </p>
                {notices}
                <div className="@container bg-brand-surface border border-brand-border rounded-[14px] p-3.5">
                    <fieldset disabled={editor.isSaving} className="contents">
                        {outOfHours ? <OutOfHoursStep editor={editor} /> : <SilenceStep editor={editor} />}
                    </fieldset>
                </div>
            </>
        );
    }

    return (
        <div ref={topRef} className="min-h-full flex flex-col bg-brand-bg scroll-mt-16">
            <div className="flex-1 w-full max-w-[640px] mx-auto px-3.5 py-3.5 grid gap-3 content-start">{content}</div>
            {screen.kind !== 'option' && (
                <div className="sticky bottom-0 flex-none bg-brand-surface border-t border-brand-border">
                    <div className="max-w-[640px] mx-auto flex gap-2 px-3.5 pt-2.5 pb-[calc(14px+var(--safe-bottom))]">{bar}</div>
                </div>
            )}
        </div>
    );
};

const ScreenHeader = ({ title, onBack, right }: { title: string; onBack: () => void; right?: ReactNode }) => (
    <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} aria-label="Volver"
            className="-ml-2 w-11 h-11 flex-none flex items-center justify-center text-brand-strong cursor-pointer"><ArrowLeft size={20} /></button>
        <h1 className="flex-1 min-w-0 truncate text-lg font-bold tracking-[-0.015em] text-brand-text">{title}</h1>
        {right}
    </div>
);

const SectionLabel = ({ children }: { children: string }) => (
    <h2 className="mt-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-muted">{children}</h2>
);

const NodeIcon = ({ node }: { node: FlowNode }) => {
    const Icon = node.kind === 'handoff' ? UserRound : node.kind === 'fallback' ? CircleHelp : MessageSquare;
    return (
        <span className={`flex-none w-[30px] h-[30px] rounded-lg flex items-center justify-center
            ${node.kind === 'handoff' ? 'bg-brand-handoff-soft text-brand-handoff-strong'
                : node.kind === 'welcome' ? 'bg-brand-deep text-brand-accent' : 'bg-brand-raised text-brand-gray-600'}`}>
            <Icon size={15} strokeWidth={2.3} />
        </span>
    );
};

/** La pantalla de inicio: el interruptor general, las respuestas y los ajustes. */
const MenuScreen = ({ editor, nodes, onMasterSwitch, notices, onOpen }: {
    editor: AutoReplyEditor;
    nodes: FlowNode[];
    onMasterSwitch: (enabled: boolean) => void;
    notices: ReactNode;
    onOpen: (screen: Screen) => void;
}) => {
    const { form } = editor;
    const full = form.keywordRules.length >= KEYWORD_RULES_MAX;
    const outOfHoursIssues = editor.showIssues ? editor.counts.outOfHours : 0;
    const addRule = () => {
        const rule = editor.addRule({ name: `Respuesta ${form.keywordRules.length + 1}` });
        onOpen({ kind: 'edit', node: ruleNode(rule) });
    };
    return (
        <>
            <h1 className="px-0.5 pt-1 text-[22px] font-bold tracking-[-0.02em] text-brand-text">Respuestas automáticas</h1>
            <div className={`bg-brand-surface border rounded-[14px] px-4 py-3.5 grid gap-2 ${form.enabled ? 'border-brand-green-200' : 'border-brand-border'}`}>
                <div className="flex items-center gap-3">
                    <div className="flex-1">
                        <div className="text-[15px] font-bold text-brand-text">{form.enabled ? 'Encendidas' : 'Apagadas'}</div>
                        <div className="text-[13px] text-brand-gray-600 mt-px">{form.enabled ? 'En todas tus líneas' : 'No sale ninguna respuesta'}</div>
                    </div>
                    <Switch size="lg" checked={form.enabled} disabled={editor.isSaving} label="Respuestas automáticas encendidas" onChange={onMasterSwitch} />
                </div>
                <div className="text-xs leading-[1.45] text-brand-muted">Cada respuesta es un mensaje que Meta cobra. Unos 1.000 gratis al mes por número.</div>
            </div>
            {notices}

            <SectionLabel>Menú</SectionLabel>
            <div className="bg-brand-surface border border-brand-border rounded-[14px] overflow-hidden divide-y divide-brand-raised">
                {nodes.map(node => {
                    const { tag, tone } = nodeTag(editor, node);
                    return (
                        <button key={node.key} type="button" onClick={() => onOpen({ kind: 'reply', node: node.key })}
                            className="w-full flex items-center gap-3 min-h-[64px] px-4 py-2.5 text-left cursor-pointer active:bg-brand-bg">
                            <NodeIcon node={node} />
                            <span className="flex-1 min-w-0">
                                <span className="flex items-center gap-2">
                                    <span className="truncate text-[15px] font-semibold text-brand-text">{node.name}</span>
                                    {tag && <span className={`flex-none text-xs font-semibold ${TAG_TONE[tone]}`}>{tag}</span>}
                                </span>
                                <span className="block text-[12.5px] text-brand-muted mt-0.5 truncate">{node.text.trim() || 'Sin texto todavía'}</span>
                            </span>
                            <ChevronRight size={16} className="flex-none text-brand-subtle" />
                        </button>
                    );
                })}
            </div>
            <DashedButton disabled={full || editor.isSaving} onClick={addRule}>{full ? `Hasta ${KEYWORD_RULES_MAX} respuestas` : '+ Nueva respuesta'}</DashedButton>

            <SectionLabel>Ajustes</SectionLabel>
            <div className="bg-brand-surface border border-brand-border rounded-[14px] overflow-hidden divide-y divide-brand-raised">
                <SettingRow title="Fuera de horario" summary={scheduleSummary(form.outOfHours.schedule)} onClick={() => onOpen({ kind: 'outOfHours' })}
                    status={outOfHoursIssues > 0
                        ? <StatusDot tone="error">{outOfHoursIssues === 1 ? '1 error' : `${outOfHoursIssues} errores`}</StatusDot>
                        : <StatusDot tone={form.outOfHours.enabled ? 'on' : 'off'}>{form.outOfHours.enabled ? 'Encendido' : 'Apagado'}</StatusDot>} />
                <SettingRow title="Cuándo se calla" summary={silenceSummary(form.handoffHours)} onClick={() => onOpen({ kind: 'silence' })} />
            </div>
        </>
    );
};

const SettingRow = ({ title, summary, status, onClick }: { title: string; summary: string; status?: ReactNode; onClick: () => void }) => (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3 min-h-[64px] px-4 py-2.5 text-left cursor-pointer active:bg-brand-bg">
        <span className="flex-1 min-w-0">
            <span className="flex items-center gap-2"><span className="text-[15px] font-semibold text-brand-text">{title}</span>{status}</span>
            <span className="block text-[12.5px] text-brand-muted mt-0.5 truncate">{summary}</span>
        </span>
        <ChevronRight size={16} className="flex-none text-brand-subtle" />
    </button>
);

const DashedButton = ({ disabled = false, onClick, children }: { disabled?: boolean; onClick: () => void; children: ReactNode }) => (
    <button type="button" disabled={disabled} onClick={onClick}
        className="h-12 rounded-xl border border-dashed border-brand-border-strong bg-brand-surface flex items-center justify-center
            text-[15px] font-semibold text-brand-strong active:bg-brand-bg cursor-pointer disabled:cursor-not-allowed disabled:text-brand-subtle">
        {children}
    </button>
);

/** p1: una respuesta, con la ruta arriba. Tocar una opción que lleva a otra respuesta entra en ella. */
const ReplyScreen = ({ editor, node, notices, crumbs, onEnter, onHome, onOpenOption }: {
    editor: AutoReplyEditor;
    node: FlowNode;
    notices: ReactNode;
    crumbs: { label: string; onClick: () => void }[];
    onEnter: (node: NodeKey) => void;
    onHome: () => void;
    onOpenOption: (index: number) => void;
}) => {
    const { form } = editor;
    const owner = ownerOf(node);
    const { tag, tone } = nodeTag(editor, node);
    const handoffCount = node.kind === 'handoff' ? incomingTo(form, 'handoff').length : 0;

    const open = (option: MenuOption, index: number) => {
        if (option.target === 'person') return onEnter('handoff');
        if (option.target === 'start') return onHome();
        const target = form.keywordRules.find(rule => rule.id === option.ruleId);
        if (target) onEnter(ruleNode(target));
        else onOpenOption(index);
    };
    const add = () => {
        if (!owner) return;
        editor.setOptions(owner, [...node.options, { title: '', target: 'rule', ruleId: null }]);
        onOpenOption(node.options.length);
    };

    return (
        <>
            <nav aria-label="Ruta" className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-0.5 pt-1 text-sm text-brand-muted">
                {crumbs.map((crumb, index) => {
                    const last = index === crumbs.length - 1;
                    return (
                        <span key={index} className="flex items-center gap-1.5">
                            {index > 0 && <span className="text-brand-subtle">›</span>}
                            {last
                                ? <b className="font-semibold text-brand-text">{crumb.label}</b>
                                : <button type="button" onClick={crumb.onClick} className="min-h-8 hover:text-brand-text cursor-pointer">{crumb.label}</button>}
                        </span>
                    );
                })}
            </nav>
            {notices}
            <div className={`bg-brand-surface rounded-[14px] ${node.kind === 'handoff' ? 'border border-brand-handoff-border' : 'border-2 border-brand-accent-strong'}
                ${node.kind !== 'handoff' && !node.enabled ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-2 px-4 h-[50px] border-b border-brand-raised">
                    <span className="flex-1 min-w-0 truncate text-[17px] font-bold tracking-[-0.01em] text-brand-text">{node.name}</span>
                    {tag && <span className={`flex-none text-[12.5px] font-semibold ${TAG_TONE[tone]}`}>{tag}</span>}
                </div>
                <div className="px-4 pt-3 pb-3.5 text-[15px] leading-[1.55] text-brand-gray-600 whitespace-pre-line break-words">
                    {node.text.trim() || <span className="text-brand-subtle">Sin texto todavía</span>}
                </div>
                {node.options.length > 0 && (
                    <div className="px-3 pb-3.5 grid gap-1.5">
                        {node.options.map((option, index) => (
                            <OptionLine key={index} editor={editor} option={option} onClick={() => open(option, index)} />
                        ))}
                    </div>
                )}
                {node.kind === 'handoff' && (
                    <div className="px-4 pb-3.5 text-[13px] leading-[1.5] text-brand-handoff-text">
                        {handoffCount === 1 ? 'Llega 1 botón' : `Llegan ${handoffCount} botones`}. Después el bot se calla y avisa al equipo.
                    </div>
                )}
            </div>
            {owner && (
                <DashedButton disabled={node.options.length >= OPTIONS_MAX || editor.isSaving} onClick={add}>
                    {node.options.length >= OPTIONS_MAX ? `Hasta ${OPTIONS_MAX} opciones por respuesta` : '+ Añadir opción'}
                </DashedButton>
            )}
        </>
    );
};

/** Una opción en p1: 48 px, con adónde lleva en una etiqueta. */
const OptionLine = ({ editor, option, onClick }: { editor: AutoReplyEditor; option: MenuOption; onClick: () => void }) => {
    const target = option.target === 'rule' ? editor.form.keywordRules.find(rule => rule.id === option.ruleId) : undefined;
    return (
        <button type="button" onClick={onClick}
            className="h-12 rounded-[10px] bg-brand-bg border border-brand-raised px-3.5 flex items-center gap-2 text-left cursor-pointer active:bg-brand-raised">
            <span className="flex-1 min-w-0 truncate text-[15px] font-semibold text-brand-text">
                {option.title.trim() || <span className="font-medium text-brand-subtle">Sin título</span>}
            </span>
            {option.target === 'rule' ? (
                target ? (
                    <span className="flex-none max-w-[150px] inline-flex items-center gap-1 rounded-full pl-1.5 pr-2 py-0.5 bg-brand-accent-soft text-brand-accent-strong text-[12.5px] font-semibold">
                        <ArrowRight size={11} strokeWidth={2.6} className="flex-none" /><span className="truncate">{ruleName(editor.form, target)}</span>
                    </span>
                ) : (
                    <span className="flex-none rounded-full px-2 py-0.5 bg-brand-raised text-brand-subtle text-[12.5px] font-semibold">Sin destino</span>
                )
            ) : (
                <OptionChip target={option.target} label={option.target === 'person' ? 'Persona' : 'Inicio'} />
            )}
        </button>
    );
};

/** p3: el título de una opción y, en una hoja, adónde lleva («Crear y escribirla» abre la nueva). */
const OptionScreen = ({ editor, node, index, onBack, onCreated }: {
    editor: AutoReplyEditor;
    node: FlowNode;
    index: number;
    onBack: () => void;
    onCreated: (node: NodeKey) => void;
}) => {
    const { form } = editor;
    const owner = ownerOf(node)!;
    const [sheetOpen, setSheetOpen] = useState(false);
    const option = node.options[index];
    const issue = editor.showIssues ? editor.issues.options[owner]?.items[index] : undefined;
    const over = option.title.length > OPTION_TITLE_MAX;
    const target = option.target === 'rule' ? form.keywordRules.find(rule => rule.id === option.ruleId) : undefined;
    const change = (patch: Partial<MenuOption>) => editor.setOptions(owner, node.options.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    const destination = option.target === 'person' ? 'Hablar con una persona' : option.target === 'start' ? 'Volver al inicio'
        : target ? ruleName(form, target) : 'Elegir destino';

    // Mientras se guarda no se edita: la respuesta del servidor reemplaza el
    // formulario y se llevaría lo de aquí (revisión de Codex del PR #189).
    return (
        <fieldset disabled={editor.isSaving} className="contents">
            <ScreenHeader title={`Opción ${index + 1} de «${node.name}»`} onBack={onBack} />
            <div className="bg-brand-surface border border-brand-border rounded-[14px] p-4 grid gap-4">
                <label className="grid gap-[7px]">
                    <span className="text-[13.5px] font-semibold text-brand-strong">Título</span>
                    <span className={`h-12 box-border rounded-[10px] border px-3 flex items-center gap-2 focus-within:ring-[3px]
                        ${issue?.title ? 'border-brand-danger bg-brand-danger-soft focus-within:ring-brand-danger-border'
                            : 'border-brand-border-strong bg-brand-surface focus-within:border-brand-success focus-within:ring-brand-accent-soft'}`}>
                        <input value={option.title} onChange={(event) => change({ title: event.target.value })} placeholder="Lo que dice el botón"
                            className="flex-1 min-w-0 bg-transparent text-base text-brand-text placeholder:text-brand-subtle focus:outline-none" />
                        <span className={`flex-none font-mono tabular-nums text-xs ${over ? 'text-brand-danger' : 'text-brand-subtle'}`}>
                            {option.title.length}/{OPTION_TITLE_MAX}
                        </span>
                    </span>
                    {issue?.title && <FieldError>{issue.title}</FieldError>}
                </label>
                <div className="grid gap-[7px]">
                    <span className="text-[13.5px] font-semibold text-brand-strong">Adónde lleva</span>
                    <button type="button" onClick={() => setSheetOpen(true)}
                        className={`h-12 rounded-[10px] border px-3 flex items-center gap-2 text-left cursor-pointer
                            ${issue?.target ? 'border-brand-danger' : 'border-brand-border-strong'}`}>
                        <span className={`flex-1 min-w-0 truncate text-[15px] font-semibold
                            ${destination === 'Elegir destino' ? 'text-brand-subtle' : option.target === 'person' ? 'text-brand-handoff-strong' : 'text-brand-text'}`}>
                            {destination}
                        </span>
                        <ChevronRight size={16} className="flex-none text-brand-subtle" />
                    </button>
                    {issue?.target && <FieldError>{issue.target}</FieldError>}
                </div>
            </div>
            <div className="flex items-center gap-3">
                <div className="flex-1 h-12"><CustomButton onClick={onBack}>Listo</CustomButton></div>
                <button type="button" onClick={() => { editor.setOptions(owner, node.options.filter((_, i) => i !== index)); onBack(); }}
                    className="h-12 px-3 text-[15px] font-semibold text-brand-danger cursor-pointer">
                    Quitar opción
                </button>
            </div>

            {sheetOpen && (
                <div className="fixed inset-0 z-[55] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={`Adónde lleva «${option.title}»`}>
                    <div className="absolute inset-0 bg-brand-ink/50" onClick={() => setSheetOpen(false)} />
                    <div className="relative max-h-[85dvh] overflow-y-auto bg-brand-surface rounded-t-2xl pt-3 pb-[calc(16px+var(--safe-bottom))]">
                        <div className="mx-auto mb-3 w-10 h-1 rounded-full bg-brand-border-strong" />
                        <h2 className="px-5 pb-2 text-[17px] font-bold tracking-[-0.01em] text-brand-text truncate">
                            Adónde lleva «{option.title.trim() || `Opción ${index + 1}`}»
                        </h2>
                        <DestinationPicker variant="sheet" form={form} self={node.rule ?? null} title={option.title}
                            onPick={(picked) => { change(picked); setSheetOpen(false); }}
                            onCreate={(name) => { const rule = editor.createRuleFor(owner, index, name); setSheetOpen(false); onCreated(ruleNode(rule)); }} />
                    </div>
                </div>
            )}
        </fieldset>
    );
};
