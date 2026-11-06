import { useCallback, useMemo, useState, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { CustomButton } from "../../../components/Button/Button";
import type { PreviewMessage } from "../../../models/autoReply.model";
import { flowNodes, ruleName, ruleNode, type NodeKey } from "../../../utils/autoReplyFlow";
import type { AutoReplyEditor } from "./useAutoReplyEditor";
import { MasterSwitch } from "./MasterSwitch";
import { FlowCanvas } from "./FlowCanvas";
import { ReplyEditor } from "./ReplyEditor";
import { TestPanel } from "./TestPanel";
import { OutOfHoursStep } from "./OutOfHoursStep";
import { SilenceStep } from "./SilenceStep";
import { Switch } from "./Switch";
import { nodeIssueCount } from "./flowIssues";

type Tab = 'menu' | 'outOfHours' | 'silence';
const TABS: { key: Tab; label: string }[] = [
    { key: 'menu', label: 'Menú' },
    { key: 'outOfHours', label: 'Fuera de horario' },
    { key: 'silence', label: 'Cuándo se calla' },
];

/**
 * «Respuestas automáticas» como lienzo (bot con menús; diseño «Respuestas
 * automáticas v4 - Lienzo», 4a a 4e), en la computadora y con la cuenta ya
 * configurada. Arriba, el interruptor general, las pestañas («Menú», «Fuera de
 * horario», «Cuándo se calla») y guardar. En «Menú», el lienzo y un panel con
 * «Probar» y «Editar». Lo que se edita y cómo se guarda sigue en
 * `useAutoReplyEditor`: todo junto, con «Guardar».
 */
export const FlowEditorView = ({ editor, onMasterSwitch, outdated, testMessages, onTestMessagesChange, children }: {
    editor: AutoReplyEditor;
    onMasterSwitch: (enabled: boolean) => void;
    /** El `PUT` dio 409 `auto_replies_outdated`: hay que recargar antes de guardar (diseño, 4e). */
    outdated: boolean;
    testMessages: PreviewMessage[];
    onTestMessagesChange: (messages: PreviewMessage[]) => void;
    /** Los diálogos de la página (encender, salir sin guardar). */
    children?: ReactNode;
}) => {
    const [tab, setTab] = useState<Tab>('menu');
    const [panel, setPanel] = useState<'test' | 'edit'>('test');
    const [selected, setSelected] = useState<NodeKey | null>(null);
    const [trace, setTrace] = useState<Set<NodeKey>>(new Set());
    const onTrace = useCallback((nodes: Set<NodeKey>) => setTrace(nodes), []);

    const nodes = useMemo(() => flowNodes(editor.form), [editor.form]);
    // Una tarjeta borrada (o «Una persona» sin botones) deja de estar.
    const node = nodes.find(candidate => candidate.key === selected) ?? null;

    const select = (key: NodeKey | null) => {
        setSelected(key);
        if (key) setPanel('edit');
    };

    const addRule = () => {
        const rule = editor.addRule({ name: `Respuesta ${editor.form.keywordRules.length + 1}` });
        select(ruleNode(rule));
    };

    /** Con errores, no guarda y lleva al primero: la pestaña y, en el menú, su tarjeta. */
    const save = () => {
        editor.saveAll();
        if (editor.issueTotal === 0) return;
        const first = nodes.find(candidate => nodeIssueCount(editor, candidate.key) > 0);
        if (first) {
            setTab('menu');
            select(first.key);
        } else if (editor.counts.outOfHours > 0) {
            setTab('outOfHours');
        }
    };

    return (
        <div className="h-full min-h-[640px] flex flex-col">
            <header className="flex-none h-[68px] box-border pl-6 pr-5 border-b border-brand-border flex items-center gap-4">
                <h1 className="text-xl font-bold tracking-[-0.025em] text-brand-text whitespace-nowrap">Respuestas automáticas</h1>
                <MasterSwitch compact editor={editor} onChange={onMasterSwitch} />
                <div role="tablist" className="ml-3 flex gap-0.5 p-[3px] rounded-[10px] bg-brand-bg border border-brand-border">
                    {TABS.map(item => {
                        const active = tab === item.key;
                        const issues = item.key === 'outOfHours' && editor.showIssues ? editor.counts.outOfHours : 0;
                        return (
                            <button key={item.key} type="button" role="tab" aria-selected={active} onClick={() => setTab(item.key)}
                                className={`h-8 px-3.5 rounded-[7px] flex items-center gap-1.5 text-[13.5px] font-semibold whitespace-nowrap cursor-pointer transition-colors
                                    ${active ? 'bg-brand-surface text-brand-text shadow-[0_1px_2px_rgba(14,17,22,0.12)]' : 'text-brand-gray-600 hover:text-brand-text'}`}>
                                {item.label}
                                {issues > 0 && <span className="w-1.5 h-1.5 rounded-full bg-brand-danger" aria-label="Con errores" />}
                            </button>
                        );
                    })}
                </div>
                <div className="ml-auto flex items-center gap-2.5">
                    {editor.dirty && (
                        <>
                            <span className="hidden xl:inline-flex items-center gap-[7px] text-[13px] text-brand-gray-600 whitespace-nowrap">
                                <span className="w-[7px] h-[7px] rounded-full bg-brand-warning" />Sin guardar
                            </span>
                            <div className="h-[38px]"><CustomButton variant="outline" onClick={editor.discard}>Descartar</CustomButton></div>
                        </>
                    )}
                    <div className="h-[38px]">
                        <CustomButton onClick={save} isLoading={editor.isSaving} disabled={!editor.dirty || outdated}>Guardar</CustomButton>
                    </div>
                </div>
            </header>

            {outdated ? (
                <Banner tone="warning" title="La página de respuestas automáticas cambió: recárgala."
                    action={<button type="button" onClick={() => window.location.reload()}
                        className="flex-none h-8 px-3.5 rounded-lg bg-brand-deep text-white text-[13px] font-semibold hover:bg-brand-deep-hover cursor-pointer">Recargar</button>}>
                    Para no borrar los menús, no se guardó nada.
                </Banner>
            ) : editor.saveBlocked && (
                <Banner tone="danger" title="No se guardó.">{blockedDetail(editor, nodes)}</Banner>
            )}

            {tab === 'menu' ? (
                <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_380px]">
                    <FlowCanvas editor={editor} selected={node?.key ?? null} trace={trace} onSelect={select} onAddRule={addRule} />
                    <aside className="min-h-0 border-l border-brand-border bg-brand-surface flex flex-col">
                        <div role="tablist" className="flex-none flex gap-1 px-4 pt-3 border-b border-brand-border">
                            <PanelTab active={panel === 'test'} onClick={() => setPanel('test')}>Probar</PanelTab>
                            <PanelTab active={panel === 'edit'} onClick={() => setPanel('edit')}>{node ? `Editar «${node.name}»` : 'Editar'}</PanelTab>
                        </div>
                        {panel === 'test' ? (
                            <div className="flex-1 min-h-0 px-4 pt-3 pb-4">
                                <TestPanel editor={editor} messages={testMessages} onMessagesChange={onTestMessagesChange} onTrace={onTrace} />
                            </div>
                        ) : node ? (
                            <ReplyEditor key={node.key} editor={editor} node={node} onSelect={select} />
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center gap-2 p-8 text-center">
                                <span className="text-[15px] font-bold text-brand-text">Elige una respuesta</span>
                                <span className="text-[13.5px] leading-[1.5] text-brand-muted">Toca una tarjeta del lienzo para editarla.</span>
                            </div>
                        )}
                    </aside>
                </div>
            ) : (
                <div className="@container flex-1 min-h-0 overflow-y-auto px-7 py-6 grid gap-6 content-start">
                    <div className="flex items-start gap-4 max-w-[1180px]">
                        <div className="flex-1 min-w-0">
                            <h2 className="text-lg font-bold tracking-[-0.015em] text-brand-text">{tab === 'outOfHours' ? 'Fuera de horario' : 'Cuándo se calla'}</h2>
                            <p className="mt-[3px] text-[13.5px] leading-[1.5] text-brand-muted">
                                {tab === 'outOfHours'
                                    ? 'A quien escribe con el negocio cerrado. Se suma a lo que responda el menú.'
                                    : 'Para que no conteste encima de una persona ni repita lo mismo.'}
                            </p>
                        </div>
                        {tab === 'outOfHours' && (
                            <span className="flex-none flex items-center gap-2.5 text-[13.5px] font-semibold text-brand-strong">
                                {editor.form.outOfHours.enabled ? 'Encendido' : 'Apagado'}
                                <Switch checked={editor.form.outOfHours.enabled} disabled={editor.isSaving} label="Fuera de horario encendido"
                                    onChange={(enabled) => editor.setOutOfHours({ enabled })} />
                            </span>
                        )}
                    </div>
                    <fieldset disabled={editor.isSaving} className="contents">
                        {tab === 'outOfHours' ? <OutOfHoursStep editor={editor} /> : <SilenceStep editor={editor} />}
                    </fieldset>
                </div>
            )}
            {children}
        </div>
    );
};

/** «Hay 5 cosas por corregir: 4 en «Precios» y 1 en «Fuera de horario».» (diseño, 4d). */
const blockedDetail = (editor: AutoReplyEditor, nodes: ReturnType<typeof flowNodes>) => {
    const places = nodes
        .map(node => ({ name: node.rule ? ruleName(editor.form, node.rule) : node.name, count: nodeIssueCount(editor, node.key) }))
        .filter(place => place.count > 0);
    if (editor.counts.outOfHours > 0) places.push({ name: 'Fuera de horario', count: editor.counts.outOfHours });
    if (editor.issues.rulesCount) places.push({ name: 'el menú', count: 1 });
    const total = editor.issueTotal;
    const where = places.map(place => `${place.count} en «${place.name}»`);
    const list = where.length > 1 ? `${where.slice(0, -1).join(', ')} y ${where[where.length - 1]}` : where[0] ?? '';
    return `Hay ${total} ${total === 1 ? 'cosa' : 'cosas'} por corregir${list ? `: ${list}` : ''}.`;
};

const Banner = ({ tone, title, action, children }: { tone: 'danger' | 'warning'; title: string; action?: ReactNode; children: ReactNode }) => (
    <div role="alert" className={`flex-none flex items-center gap-2.5 pl-6 pr-5 py-2.5 border-b text-[13.5px] text-brand-strong
        ${tone === 'danger' ? 'bg-brand-danger-soft border-brand-danger-border' : 'bg-brand-warning-soft border-brand-border'}`}>
        <AlertCircle size={16} className={`flex-none ${tone === 'danger' ? 'text-brand-danger' : 'text-brand-warning'}`} />
        <span className="flex-1 min-w-0"><b className="font-semibold text-brand-text">{title}</b> {children}</span>
        {action}
    </div>
);

const PanelTab = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) => (
    <button type="button" role="tab" aria-selected={active} onClick={onClick}
        className={`-mb-px h-10 px-3 min-w-0 flex items-center text-sm font-semibold whitespace-nowrap border-b-2 cursor-pointer transition-colors
            ${active ? 'text-brand-text border-brand-accent-strong' : 'text-brand-muted border-transparent hover:text-brand-text'}`}>
        <span className="truncate">{children}</span>
    </button>
);
