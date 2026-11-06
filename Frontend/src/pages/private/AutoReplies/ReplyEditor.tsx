import { useState } from "react";
import { ChevronDown, ChevronUp, List, Rows3, X } from "lucide-react";
import {
    BUTTONS_MAX, OPTION_TITLE_MAX, OPTIONS_MAX, RETURN_AFTER_DAYS, RULE_NAME_MAX,
    type MenuOption, type ReturnAfterDays,
} from "../../../models/autoReply.model";
import { ConfirmDialog } from "../../../components/Dialog/ConfirmDialog";
import { incomingTo, ruleKeyOf, ruleName, type FlowNode, type NodeKey } from "../../../utils/autoReplyFlow";
import type { AutoReplyEditor, OptionsOwner } from "./useAutoReplyEditor";
import { FieldError, ReplyTextField } from "./ReplyTextField";
import { KeywordInput } from "./KeywordsStep";
import { DestinationPicker } from "./DestinationPicker";
import { Switch } from "./Switch";

const RETURN_LABEL: Record<string, string> = { 7: '7 días', 30: '30 días', 90: '90 días', null: 'Nunca' };

/** «Con 2 opciones salen como botones…»: cómo verá el menú el contacto. */
const formatLine = (count: number) => {
    if (count === 0) return 'Sin opciones: solo sale el texto.';
    if (count <= BUTTONS_MAX) return `Con ${count} ${count === 1 ? 'opción sale un botón' : 'opciones salen como botones'} debajo del mensaje.`;
    return `Con ${count} opciones sale como lista: el contacto toca «Ver opciones».`;
};

/**
 * La pestaña «Editar» del panel (diseño «Respuestas automáticas v4», 4b y
 * 4d): el nombre y el interruptor, desde dónde se llega, las frases, el texto
 * y las opciones con su destino. Cada error, debajo de su campo. La
 * bienvenida suma cuándo vuelve a saludar; «Una persona» es solo su texto.
 */
export const ReplyEditor = ({ editor, node, onSelect }: { editor: AutoReplyEditor; node: FlowNode; onSelect: (node: NodeKey | null) => void }) => {
    const { form } = editor;
    const show = editor.showIssues;
    const [openPicker, setOpenPicker] = useState<number | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const rule = node.rule;
    const owner: OptionsOwner | null = node.kind === 'welcome' ? 'welcome' : node.kind === 'fallback' ? 'fallback' : rule ? rule.key : null;
    const optionIssues = owner ? editor.issues.options[owner] : undefined;
    const incoming = incomingTo(form, node.key);
    const nameOf = (key: NodeKey) => {
        if (key === 'welcome') return 'Bienvenida';
        if (key === 'fallback') return 'Si no entiende';
        const found = form.keywordRules.find(candidate => candidate.key === ruleKeyOf(key));
        return found ? ruleName(form, found) : '';
    };

    const from = node.kind === 'welcome' ? 'Sale a quien escribe por primera vez'
        : node.kind === 'fallback' ? 'Sale cuando no coincide ninguna frase'
        : node.kind === 'handoff' ? `Texto para toda la cuenta · ${incoming.length === 1 ? 'llega 1 botón' : `llegan ${incoming.length} botones`}`
        : incoming.length ? `Se llega desde ${[...new Set(incoming.map(item => nameOf(item.from)))].join(', ')}`
        : rule?.keywords.length ? 'Se llega escribiendo sus frases' : 'No se llega desde ningún sitio';

    const setOptions = (options: MenuOption[]) => owner && editor.setOptions(owner, options);
    const options = node.options;
    const change = (index: number, patch: Partial<MenuOption>) => setOptions(options.map((option, i) => (i === index ? { ...option, ...patch } : option)));
    const move = (index: number, delta: -1 | 1) => {
        const to = index + delta;
        if (to < 0 || to >= options.length) return;
        const next = [...options];
        [next[index], next[to]] = [next[to], next[index]];
        setOptions(next);
        setOpenPicker(null);
    };
    const destinationLabel = (option: MenuOption) => {
        if (option.target === 'start') return 'Volver al inicio';
        if (option.target === 'person') return 'Una persona';
        const target = form.keywordRules.find(candidate => candidate.id === option.ruleId);
        return target ? ruleName(form, target) : 'Elegir destino';
    };

    const enabled = node.kind === 'welcome' ? form.welcome.enabled : node.kind === 'fallback' ? form.fallback.enabled : rule?.enabled ?? true;
    const setEnabled = (value: boolean) => {
        if (node.kind === 'welcome') editor.setWelcome({ enabled: value });
        else if (node.kind === 'fallback') editor.setFallback({ enabled: value });
        else if (rule) editor.setRule(rule.key, { enabled: value });
    };
    const text = node.kind === 'handoff' ? form.handoff.text : node.text;
    const setText = (value: string) => {
        if (node.kind === 'welcome') editor.setWelcome({ text: value });
        else if (node.kind === 'fallback') editor.setFallback({ text: value });
        else if (node.kind === 'handoff') editor.setHandoffText(value);
        else if (rule) editor.setRule(rule.key, { text: value });
    };
    const textError = !show ? undefined
        : node.kind === 'welcome' ? editor.issues.welcomeText
        : node.kind === 'fallback' ? editor.issues.fallbackText
        : node.kind === 'handoff' ? editor.issues.handoffText
        : rule ? editor.issues.rules[rule.key]?.text : undefined;

    return (
        <fieldset disabled={editor.isSaving} className="flex-1 min-h-0 overflow-y-auto px-[18px] pt-[18px] pb-6 grid gap-[18px] content-start">
            <div className="grid gap-1">
                <div className="flex items-center gap-2.5">
                    {rule ? (
                        <input value={rule.name} placeholder={ruleName(form, rule)} maxLength={RULE_NAME_MAX} aria-label="Nombre de la respuesta"
                            onChange={(event) => editor.setRule(rule.key, { name: event.target.value })}
                            className="flex-1 min-w-0 -ml-1.5 px-1.5 py-0.5 rounded-md border border-transparent bg-transparent text-[19px] font-bold tracking-[-0.02em]
                                text-brand-text placeholder:text-brand-text hover:border-brand-border focus:outline-none focus:border-brand-success
                                focus:ring-[3px] focus:ring-brand-accent-soft" />
                    ) : (
                        <span className="flex-1 min-w-0 text-[19px] font-bold tracking-[-0.02em] text-brand-text">{node.name}</span>
                    )}
                    {node.kind !== 'handoff' && <Switch checked={enabled} label={`${node.name} encendida`} onChange={setEnabled} />}
                </div>
                <div className="text-[13px] text-brand-muted">{from}</div>
            </div>

            {rule && (
                <KeywordInput optional keywords={rule.keywords} onChange={(keywords) => editor.setRule(rule.key, { keywords })} />
            )}

            <ReplyTextField label="Texto" value={text} onChange={setText} error={textError} minHeight="min-h-[96px]"
                placeholder={node.kind === 'handoff' ? 'Enseguida te atiende alguien del equipo' : 'Lo que recibe el contacto…'} />

            {node.kind === 'welcome' && (
                <div className="grid gap-2">
                    <span id="welcome-return" className="text-[13.5px] font-semibold text-brand-strong">Volver a saludar a quien ya había escrito</span>
                    <div role="radiogroup" aria-labelledby="welcome-return" className="justify-self-start flex gap-0.5 p-[3px] rounded-[9px] bg-brand-bg">
                        {RETURN_AFTER_DAYS.map(days => {
                            const selected = form.welcome.returnAfterDays === days;
                            return (
                                <button key={String(days)} type="button" role="radio" aria-checked={selected}
                                    onClick={() => editor.setWelcome({ returnAfterDays: days as ReturnAfterDays })}
                                    className={`px-3 py-1.5 rounded-[7px] text-[13px] cursor-pointer transition-colors
                                        ${selected ? 'bg-brand-surface font-semibold text-brand-text shadow-[0_1px_2px_rgba(14,17,22,0.12)]' : 'font-medium text-brand-muted hover:text-brand-text'}`}>
                                    {RETURN_LABEL[String(days)]}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {owner && (
                <div className="grid gap-2">
                    <div className="flex items-center gap-2">
                        <span className="text-[13.5px] font-semibold text-brand-strong">Opciones</span>
                        <span className="font-mono tabular-nums text-xs text-brand-muted">{options.length} de {OPTIONS_MAX}</span>
                    </div>
                    <div className="flex items-center gap-2 px-[11px] py-2 rounded-[9px] bg-brand-bg text-[13px] text-brand-strong">
                        {options.length > BUTTONS_MAX
                            ? <List size={14} strokeWidth={2.2} className="flex-none text-brand-accent-strong" />
                            : <Rows3 size={14} strokeWidth={2.2} className="flex-none text-brand-accent-strong" />}
                        <span>{formatLine(options.length)}</span>
                    </div>
                    {options.map((option, index) => {
                        const issue = show ? optionIssues?.items[index] : undefined;
                        const open = openPicker === index;
                        const over = option.title.length > OPTION_TITLE_MAX;
                        return (
                            <div key={index} className="grid gap-1.5">
                                <div className="grid grid-cols-[14px_minmax(0,1fr)_132px_22px] gap-1.5 items-center">
                                    <span className="grid">
                                        <button type="button" aria-label="Subir" disabled={index === 0} onClick={() => move(index, -1)}
                                            className="h-[17px] flex items-center justify-center text-brand-subtle hover:text-brand-text cursor-pointer disabled:invisible">
                                            <ChevronUp size={13} strokeWidth={2.4} />
                                        </button>
                                        <button type="button" aria-label="Bajar" disabled={index === options.length - 1} onClick={() => move(index, 1)}
                                            className="h-[17px] flex items-center justify-center text-brand-subtle hover:text-brand-text cursor-pointer disabled:invisible">
                                            <ChevronDown size={13} strokeWidth={2.4} />
                                        </button>
                                    </span>
                                    <div className={`h-[38px] box-border rounded-lg border px-2.5 flex items-center gap-1.5 min-w-0
                                        focus-within:ring-[3px] ${issue?.title
                                            ? 'border-brand-danger bg-brand-danger-soft focus-within:ring-brand-danger-border'
                                            : 'border-brand-border-strong bg-brand-surface focus-within:border-brand-success focus-within:ring-brand-accent-soft'}`}>
                                        <input value={option.title} placeholder="Título" aria-label={`Título de la opción ${index + 1}`}
                                            onChange={(event) => change(index, { title: event.target.value })}
                                            className="flex-1 min-w-0 bg-transparent text-sm font-medium text-brand-text placeholder:text-brand-subtle focus:outline-none" />
                                        <span className={`flex-none font-mono tabular-nums text-[10.5px] ${over ? 'text-brand-danger' : 'text-brand-subtle'}`}>
                                            {option.title.length}/{OPTION_TITLE_MAX}
                                        </span>
                                    </div>
                                    <button type="button" onClick={() => setOpenPicker(open ? null : index)} aria-expanded={open}
                                        className={`h-[38px] box-border rounded-lg border pl-2.5 pr-2 flex items-center gap-1.5 min-w-0 cursor-pointer
                                            ${issue?.target ? 'border-brand-danger' : open ? 'border-brand-accent-strong ring-[3px] ring-brand-accent-soft' : 'border-brand-border-strong'}`}>
                                        <span className={`flex-1 min-w-0 truncate text-left text-[13px] font-semibold
                                            ${option.target === 'rule' && !form.keywordRules.some(r => r.id === option.ruleId) ? 'text-brand-subtle'
                                                : option.target === 'person' ? 'text-brand-handoff-strong' : 'text-brand-text'}`}>
                                            {destinationLabel(option)}
                                        </span>
                                        <ChevronDown size={12} strokeWidth={2.2} className="flex-none text-brand-muted" />
                                    </button>
                                    <button type="button" aria-label={`Quitar la opción ${index + 1}`}
                                        onClick={() => { setOptions(options.filter((_, i) => i !== index)); setOpenPicker(null); }}
                                        className="flex justify-center text-brand-subtle hover:text-brand-text cursor-pointer">
                                        <X size={13} strokeWidth={2.4} />
                                    </button>
                                </div>
                                {issue?.title && <div className="pl-5"><FieldError>{issue.title}</FieldError></div>}
                                {issue?.target && <div className="pl-5"><FieldError>{issue.target}</FieldError></div>}
                                {open && (
                                    <div className="pl-5">
                                        <DestinationPicker form={form} self={rule ?? null} title={option.title}
                                            onPick={(target) => { change(index, target); setOpenPicker(null); }}
                                            onCreate={(name) => { editor.createRuleFor(owner, index, name); setOpenPicker(null); }} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {show && optionIssues?.list && <FieldError>{optionIssues.list}</FieldError>}
                    <button type="button" disabled={options.length >= OPTIONS_MAX}
                        onClick={() => { setOptions([...options, { title: '', target: 'rule', ruleId: null }]); setOpenPicker(options.length); }}
                        className="h-[38px] rounded-[9px] border border-dashed border-brand-border-strong flex items-center justify-center
                            text-[13.5px] font-semibold text-brand-strong hover:bg-brand-bg cursor-pointer transition-colors
                            disabled:cursor-not-allowed disabled:text-brand-subtle disabled:hover:bg-transparent">
                        {options.length >= OPTIONS_MAX ? `Hasta ${OPTIONS_MAX} opciones por respuesta` : '+ Añadir opción'}
                    </button>
                </div>
            )}

            {rule && (
                <button type="button" onClick={() => setConfirmDelete(true)}
                    className="justify-self-start text-[13.5px] font-semibold text-brand-danger hover:underline cursor-pointer">
                    Borrar respuesta
                </button>
            )}

            {rule && (
                <ConfirmDialog
                    open={confirmDelete}
                    tone="danger"
                    title={`¿Borrar «${ruleName(form, rule)}»?`}
                    description={incoming.length
                        ? `Llevan a ella ${incoming.map(item => `«${item.option.title.trim() || 'sin título'}» de ${nameOf(item.from)}`).join(', ')}. Esos botones también se quitan: no pueden llevar a una respuesta que no existe.`
                        : 'Ningún botón lleva a ella. Se borra al guardar.'}
                    confirmLabel="Borrar respuesta"
                    cancelLabel="Cancelar"
                    onConfirm={() => { setConfirmDelete(false); editor.removeRule(rule.key); onSelect(null); }}
                    onCancel={() => setConfirmDelete(false)}
                />
            )}
        </fieldset>
    );
};
