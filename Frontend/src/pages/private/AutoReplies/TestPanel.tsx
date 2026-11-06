import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { List, Reply, RotateCcw, Send } from "lucide-react";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { usePreviewAutoReply } from "../../../hooks/useAutoReplies";
import { useAutosizeTextarea } from "../../../hooks/useAutosizeTextarea";
import {
    PREVIEW_MESSAGES_MAX, type AutoReplyPreviewPart, type AutoReplyPreviewTurn, type PreviewMessage,
} from "../../../models/autoReply.model";
import { clockIn, toPayload, type AutoReplyForm } from "../../../utils/autoReplyForm";
import { ruleName, ruleNode, type NodeKey } from "../../../utils/autoReplyFlow";
import { SkeletonBox } from "../../../components/Skeleton/Skeleton";
import { apiErrorOf } from "../../../utils/apiError";
import type { AutoReplyEditor } from "./useAutoReplyEditor";

/** El mismo límite que `autoReplyPreviewSchema` en el backend. */
const PREVIEW_TEXT_MAX = 1000;

/** «Precios · tocó una opción»: de dónde salió cada parte de la respuesta. */
const partLabel = (form: AutoReplyForm, part: AutoReplyPreviewPart) => {
    const rule = part.ruleIndex !== undefined ? form.keywordRules[part.ruleIndex] : undefined;
    const name = rule ? ruleName(form, rule) : 'Una respuesta';
    switch (part.kind) {
        case 'welcome': return 'Bienvenida';
        case 'keyword': return `${name} · «${part.keyword}»`;
        case 'option': return `${name} · tocó una opción`;
        case 'handoff': return 'Hablar con una persona';
        case 'outOfHours': return 'Fuera de horario';
        case 'fallback': return 'Si no entiende';
    }
};

/** La tarjeta del lienzo de la que salió una parte (para marcar el recorrido). */
const partNode = (form: AutoReplyForm, part: AutoReplyPreviewPart): NodeKey | null => {
    if (part.kind === 'welcome') return 'welcome';
    if (part.kind === 'fallback') return 'fallback';
    if (part.kind === 'handoff') return 'handoff';
    const rule = part.ruleIndex !== undefined ? form.keywordRules[part.ruleIndex] : undefined;
    return rule ? ruleNode(rule) : null;
};

/** Por qué no respondió, con lo que dice el backend (no se vuelve a decidir aquí). */
const silenceReason = (turn: AutoReplyPreviewTurn) => {
    if (turn.repeated.length) return `ya respondió ${turn.repeated.map(r => `«${r.keyword}»`).join(', ')} en esta conversación.`;
    if (turn.fallbackRepeated) return 'el «no entiendo» ya salió en esta conversación.';
    return 'ninguna respuesta coincidió.';
};

const textOf = (message: PreviewMessage) => (typeof message === 'string' ? message : message.title);

/**
 * «Probar» como una conversación (spec § 10; con menús, diseño «Respuestas
 * automáticas v4», 4c): cada mensaje, escrito o el toque de una opción, se suma
 * a los anteriores y el backend simula la conversación entera de un contacto
 * nuevo, con lo que hay en pantalla y sin guardar. Las opciones del bot se
 * tocan como en WhatsApp: los botones, o la lista desde «Ver opciones». La
 * conversación la guarda la página (`messages`), para marcar el recorrido en el
 * lienzo (`onTrace`). Con errores marcados no prueba: el backend valida todo.
 */
export const TestPanel = ({ editor, messages, onMessagesChange, onTrace, heading = false }: {
    editor: AutoReplyEditor;
    messages: PreviewMessage[];
    onMessagesChange: (messages: PreviewMessage[]) => void;
    /** Las tarjetas por las que pasó la conversación. */
    onTrace?: (nodes: Set<NodeKey>) => void;
    /** Con su título «Probar» (la página de pasos; el lienzo lo pone en su pestaña). */
    heading?: boolean;
}) => {
    const { form } = editor;
    const [draft, setDraft] = useState('');
    const [sheet, setSheet] = useState<number | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const threadRef = useRef<HTMLDivElement>(null);
    useAutosizeTextarea(inputRef, draft, 96);

    // Se recalcula tras 1 s sin cambios: así la actualización sola no pasa de 60
    // por minuto, y con los 20 mensajes de una conversación queda por debajo
    // del límite del servidor (120 por minuto y cuenta; revisión de Codex).
    const settings = useDebouncedValue(useMemo(() => toPayload(form), [form]), 1000);
    const blocked = editor.issueTotal > 0;
    const preview = usePreviewAutoReply(settings, messages, !blocked);
    const clock = clockIn(form.timezone);
    const full = messages.length >= PREVIEW_MESSAGES_MAX;
    const turns = useMemo(() => preview.data ?? [], [preview.data]);

    const add = (message: PreviewMessage) => {
        if (full) return;
        setSheet(null);
        onMessagesChange([...messages, message]);
    };
    const send = () => {
        const text = draft.trim();
        if (!text || full) return;
        add(text);
        setDraft('');
    };

    // El recorrido en el lienzo: las tarjetas de las que salió cada respuesta.
    useEffect(() => {
        if (!onTrace) return;
        const nodes = new Set<NodeKey>();
        turns.slice(0, messages.length).forEach(turn => turn.parts.forEach(part => {
            const node = partNode(form, part);
            if (node) nodes.add(node);
        }));
        onTrace(nodes);
    }, [turns, messages.length, form, onTrace]);

    // Lo último a la vista, como en un chat.
    useEffect(() => {
        const el = threadRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [messages.length, turns.length]);

    const sheetTurn = sheet !== null ? turns[sheet] : undefined;

    return (
        <div className="flex flex-col gap-2.5 min-h-0 h-full">
            {heading && <span className="flex-none text-base font-bold text-brand-text">Probar</span>}
            <div className="flex-none flex items-center gap-2">
                {/* La hora cuenta (el fuera de horario): va al pasar por encima. */}
                <span title={`Responde como si fuera ahora: ${clock.when}`} className="min-w-0 truncate text-[13px] text-brand-muted">
                    Como un contacto nuevo, sin guardar.
                </span>
                {messages.length > 0 && (
                    <button type="button" onClick={() => { setSheet(null); onMessagesChange([]); }}
                        className="ml-auto flex-none inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-semibold text-brand-accent-strong
                            hover:underline cursor-pointer">
                        <RotateCcw size={13} /> Empezar de nuevo
                    </button>
                )}
            </div>

            <div className="relative flex-1 min-h-[160px] rounded-xl bg-brand-bg overflow-hidden flex">
                <div ref={threadRef} className="flex-1 overflow-y-auto px-3 py-3.5 flex flex-col gap-2.5" aria-live="polite">
                    {blocked ? (
                        <Hint>Corrige lo marcado para probar.</Hint>
                    ) : messages.length === 0 ? (
                        <Hint>Escribe un mensaje como lo haría un cliente, por ejemplo «hola, cuánto está?», y sigue la conversación.</Hint>
                    ) : messages.map((message, index) => {
                        const turn = turns[index];
                        return (
                            <div key={index} className="flex flex-col gap-2.5">
                                <div className="self-start max-w-[82%] bg-brand-surface rounded-[12px_12px_12px_3px] px-[9px] pt-[7px] pb-1.5 grid gap-1">
                                    {typeof message !== 'string' && (
                                        <span className="inline-flex items-center gap-1 text-[11px] text-brand-muted">
                                            <Reply size={11} strokeWidth={2.2} />Tocó una opción
                                        </span>
                                    )}
                                    <span className="text-sm leading-[1.45] text-brand-text whitespace-pre-wrap break-words">{textOf(message)}</span>
                                </div>
                                {!turn ? (
                                    // Cargando solo mientras de verdad se pregunta; con un error, el aviso va abajo.
                                    preview.isFetching && <SkeletonBox className="self-end w-[60%] h-14 rounded-[12px_12px_3px_12px]" tone="bubble-own" />
                                ) : turn.reply ? (
                                    <div className={`self-end w-[86%] grid gap-[5px] transition-opacity ${preview.isPlaceholderData ? 'opacity-60' : ''}`}>
                                        <div className="bg-brand-accent-soft rounded-[12px_12px_3px_12px] px-[11px] pt-2 pb-1.5 grid gap-[3px] text-sm leading-[1.45] text-brand-text">
                                            {turn.parts.map((part, i) => <div key={i} className="whitespace-pre-wrap break-words">{part.text}</div>)}
                                            <span className="justify-self-end text-[11px] text-brand-gray-600">
                                                <span className="font-mono">{clock.time}</span> · <b className="text-brand-accent-strong">Bot</b>
                                            </span>
                                        </div>
                                        {turn.optionsFormat === 'buttons' && turn.options.map(option => (
                                            <OptionButton key={option.id} disabled={full} onClick={() => add({ optionId: option.id, title: option.title })}>
                                                {option.title}
                                            </OptionButton>
                                        ))}
                                        {turn.optionsFormat === 'list' && (
                                            <OptionButton disabled={full} onClick={() => setSheet(index)}>
                                                <List size={14} strokeWidth={2.2} />Ver opciones
                                            </OptionButton>
                                        )}
                                        <span className="justify-self-end text-[11.5px] text-brand-muted text-right">
                                            Salió: <b className="font-semibold text-brand-strong">{turn.parts.map(part => partLabel(form, part)).join(' · ')}</b>
                                        </span>
                                        {turn.parts.some(part => part.kind === 'handoff') && (
                                            <HandoffNote>El bot se calla aquí. En Chats la conversación queda marcada y se avisa al equipo.</HandoffNote>
                                        )}
                                    </div>
                                ) : turn.skip === 'handoff' ? (
                                    <HandoffNote>No responde: el bot está callado en esta conversación.</HandoffNote>
                                ) : (
                                    <Note>No respondería: {silenceReason(turn)}</Note>
                                )}
                            </div>
                        );
                    })}
                    {!blocked && preview.isError && !preview.isFetching && (
                        <Note>
                            {apiErrorOf(preview.error, 'No se pudo probar.').message}{' '}
                            <button type="button" onClick={() => preview.refetch()} className="font-semibold text-brand-accent-strong hover:underline cursor-pointer">
                                Reintentar
                            </button>
                        </Note>
                    )}
                </div>

                {sheetTurn && (
                    <>
                        <div onClick={() => setSheet(null)} aria-hidden className="absolute inset-0 bg-brand-ink/30" />
                        <div role="dialog" aria-label="Opciones" className="absolute inset-x-0 bottom-0 bg-brand-surface rounded-t-[14px] py-2.5">
                            <div className="px-4 pt-0.5 pb-2 text-[15px] font-bold text-brand-text">Elige una opción</div>
                            {sheetTurn.options.map(option => (
                                <button key={option.id} type="button" onClick={() => add({ optionId: option.id, title: option.title })}
                                    className="w-full flex items-center px-4 py-[11px] border-t border-brand-bg text-left text-sm text-brand-text
                                        hover:bg-brand-green-50 cursor-pointer">
                                    <span className="flex-1">{option.title}</span>
                                    <span aria-hidden className="w-4 h-4 rounded-full border-[1.5px] border-brand-subtle" />
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            <div className="flex-none flex gap-2 items-end">
                <textarea
                    ref={inputRef}
                    rows={1}
                    maxLength={PREVIEW_TEXT_MAX}
                    value={draft}
                    disabled={full}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            send();
                        }
                    }}
                    aria-label="Mensaje de prueba"
                    placeholder={full ? 'Empieza de nuevo para seguir probando' : 'Escribe como el contacto'}
                    className="flex-1 min-w-0 resize-none rounded-[10px] border border-brand-border-strong bg-brand-surface px-3 py-[10px]
                        text-base sm:text-sm leading-[1.4] text-brand-text placeholder:text-brand-subtle
                        focus:outline-none focus:border-brand-success focus:ring-[3px] focus:ring-brand-accent-soft
                        disabled:bg-brand-bg disabled:cursor-not-allowed"
                />
                <button type="button" onClick={send} disabled={!draft.trim() || full} title="Enviar" aria-label="Enviar"
                    className="flex-none w-[42px] h-[42px] rounded-[10px] bg-brand-deep text-white flex items-center justify-center
                        hover:bg-brand-deep-hover cursor-pointer disabled:bg-brand-raised disabled:text-brand-subtle disabled:cursor-not-allowed">
                    <Send size={15} />
                </button>
            </div>

            {editor.mode === 'tabs' && !form.enabled && (
                <div className="flex-none text-[12.5px] leading-[1.5] text-brand-muted">
                    Ahora están apagadas: esto es lo que respondería al encenderlas.
                </div>
            )}
        </div>
    );
};

/** Un botón del bot, tocable como en WhatsApp (también los de un menú anterior). */
const OptionButton = ({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: ReactNode }) => (
    <button type="button" disabled={disabled} onClick={onClick}
        className="h-9 rounded-[9px] bg-brand-surface shadow-[0_1px_0_rgba(14,17,22,0.07)] flex items-center justify-center gap-[7px]
            text-sm font-semibold text-brand-accent-strong hover:bg-brand-green-50 cursor-pointer transition-colors
            disabled:cursor-default disabled:text-brand-muted disabled:hover:bg-brand-surface">
        {children}
    </button>
);

const Hint = ({ children }: { children: string }) => (
    <div className="m-auto max-w-[240px] text-center text-[13px] leading-[1.5] text-brand-muted">{children}</div>
);

/** Una nota del sistema en el hilo: por qué no respondió. */
const Note = ({ children }: { children: ReactNode }) => (
    <div className="self-center max-w-[92%] text-center rounded-[9px] bg-brand-raised px-3 py-1.5 text-[12px] leading-[1.45] text-brand-gray-600">
        {children}
    </div>
);

/** Lo que pasa al pedir una persona, en el ámbar de esa marca (diseño 4c). */
const HandoffNote = ({ children }: { children: ReactNode }) => (
    <div className="self-center max-w-[92%] text-center rounded-[9px] bg-brand-handoff-wash border border-brand-handoff-border px-[11px] py-2
        text-[12.5px] leading-[1.45] text-brand-handoff-text">
        {children}
    </div>
);
