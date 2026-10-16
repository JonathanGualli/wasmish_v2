import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RotateCcw, Send } from "lucide-react";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { usePreviewAutoReply } from "../../../hooks/useAutoReplies";
import { useAutosizeTextarea } from "../../../hooks/useAutosizeTextarea";
import { PREVIEW_MESSAGES_MAX, type AutoReplyPreviewPart, type AutoReplyPreviewTurn } from "../../../models/autoReply.model";
import { clockIn, toPayload } from "../../../utils/autoReplyForm";
import { SkeletonBox } from "../../../components/Skeleton/Skeleton";
import type { AutoReplyEditor } from "./useAutoReplyEditor";

/** El mismo límite que `autoReplyPreviewSchema` en el backend. */
const PREVIEW_TEXT_MAX = 1000;

/** «Bienvenida · Regla 2, «precio»»: de dónde salió cada parte de la respuesta. */
const partLabel = (part: AutoReplyPreviewPart) => {
    switch (part.kind) {
        case 'welcome': return 'Bienvenida';
        case 'keyword': return `Regla ${(part.ruleIndex ?? 0) + 1}, «${part.keyword}»`;
        case 'outOfHours': return 'Fuera de horario';
        case 'fallback': return 'Si no entiende';
    }
};

/** Por qué no respondió, con lo que dice el backend (no se vuelve a decidir aquí). */
const silenceReason = (turn: AutoReplyPreviewTurn) => {
    if (turn.repeated.length) return `ya respondió ${turn.repeated.map(r => `«${r.keyword}»`).join(', ')} en esta conversación.`;
    if (turn.fallbackRepeated) return 'el «no entiendo» ya salió en esta conversación.';
    return 'ninguna regla coincidió.';
};

/**
 * «Probar» como una conversación (spec § 10): cada mensaje se suma a los
 * anteriores y el backend simula la conversación entera de un contacto nuevo,
 * con lo que hay en pantalla y sin guardar. Al cambiar la configuración se
 * vuelve a simular entera. «Reiniciar» empieza de cero. Con errores marcados
 * no prueba: el backend valida la configuración entera.
 */
export const TestPanel = ({ editor }: { editor: AutoReplyEditor }) => {
    const { form } = editor;
    const [draft, setDraft] = useState('');
    const [messages, setMessages] = useState<string[]>([]);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const threadRef = useRef<HTMLDivElement>(null);
    useAutosizeTextarea(inputRef, draft, 96);

    const settings = useDebouncedValue(useMemo(() => toPayload(form), [form]), 400);
    const blocked = editor.issueTotal > 0;
    const preview = usePreviewAutoReply(settings, messages, !blocked);
    const clock = clockIn(form.timezone);
    const full = messages.length >= PREVIEW_MESSAGES_MAX;
    const turns = preview.data ?? [];

    const send = () => {
        const text = draft.trim();
        if (!text || full) return;
        setMessages(current => [...current, text]);
        setDraft('');
    };

    // Lo último a la vista, como en un chat.
    useEffect(() => {
        const el = threadRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [messages.length, turns.length]);

    return (
        <div className="flex flex-col gap-3 min-h-0 h-full">
            <div className="flex-none">
                <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-brand-text">Probar</span>
                    <span className="whitespace-nowrap rounded-full bg-brand-bg px-[9px] py-1 text-[11px] font-bold uppercase tracking-[0.05em] text-brand-gray-600">
                        Sin guardar
                    </span>
                    {messages.length > 0 && (
                        <button type="button" onClick={() => setMessages([])} aria-label="Reiniciar conversación" title="Reiniciar conversación"
                            className="ml-auto inline-flex items-center gap-1 whitespace-nowrap text-[12.5px] font-semibold text-brand-accent-strong hover:underline cursor-pointer">
                            <RotateCcw size={13} /> Reiniciar
                        </button>
                    )}
                </div>
                <div className="mt-[3px] text-[12.5px] leading-[1.5] text-brand-muted">
                    Escribe como lo haría un cliente nuevo: cada mensaje sigue la conversación.
                </div>
            </div>

            <div className="flex-none text-[11.5px] font-semibold uppercase tracking-[0.08em] text-brand-muted">Respondería ahora · {clock.when}</div>

            <div ref={threadRef} className="flex-1 min-h-[160px] overflow-y-auto rounded-[10px] bg-brand-bg px-2.5 py-3 flex flex-col gap-2" aria-live="polite">
                {blocked ? (
                    <Hint>Corrige lo marcado para probar.</Hint>
                ) : messages.length === 0 ? (
                    <Hint>Escribe un mensaje como lo haría un cliente, por ejemplo «hola, cuánto está?», y sigue la conversación.</Hint>
                ) : messages.map((message, index) => {
                    const turn = turns[index];
                    return (
                        <div key={index} className="flex flex-col gap-2">
                            <div className="self-start max-w-[85%] bg-brand-surface rounded-[10px_10px_10px_3px] px-2.5 py-[7px] text-[13px] leading-[1.45] text-brand-text whitespace-pre-wrap break-words">
                                {message}
                            </div>
                            {preview.isError && index === messages.length - 1 ? (
                                <Note>No se pudo probar. Inténtalo de nuevo.</Note>
                            ) : !turn ? (
                                <SkeletonBox className="self-end w-[60%] h-14 rounded-[10px_10px_3px_10px]" tone="bubble-own" />
                            ) : turn.reply ? (
                                <div className={`self-end max-w-[94%] grid gap-1 justify-items-end transition-opacity ${preview.isPlaceholderData ? 'opacity-60' : ''}`}>
                                    <div className="bg-brand-accent-soft rounded-[10px_10px_3px_10px] px-2.5 pt-2 pb-1.5 grid gap-[7px] text-[13px] leading-[1.45] text-brand-text">
                                        {turn.parts.map((part, i) => <div key={i} className="whitespace-pre-wrap break-words">{part.text}</div>)}
                                        <div className="justify-self-end flex gap-[5px] font-mono text-[11px] text-brand-gray-600">
                                            <span>{clock.time}</span><span>·</span><span className="font-sans font-bold text-brand-accent-strong">Bot</span>
                                        </div>
                                    </div>
                                    <div className="text-[11.5px] text-brand-muted text-right">{turn.parts.map(partLabel).join(' · ')}</div>
                                </div>
                            ) : (
                                <Note>No respondería: {silenceReason(turn)}</Note>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="flex-none flex gap-1.5 items-end">
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
                    placeholder={full ? 'Reinicia para seguir probando' : messages.length ? 'Sigue la conversación…' : 'Escribe un mensaje de ejemplo…'}
                    className="flex-1 min-w-0 resize-none rounded-[9px] border border-brand-border-strong bg-brand-surface px-[11px] py-[9px]
                        text-base sm:text-[13.5px] leading-[1.4] text-brand-text placeholder:text-brand-subtle
                        focus:outline-none focus:border-brand-success focus:ring-[3px] focus:ring-brand-accent-soft
                        disabled:bg-brand-bg disabled:cursor-not-allowed"
                />
                <button type="button" onClick={send} disabled={!draft.trim() || full} title="Enviar" aria-label="Enviar"
                    className="flex-none w-[38px] h-[38px] rounded-[9px] bg-brand-deep text-white flex items-center justify-center
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

const Hint = ({ children }: { children: string }) => (
    <div className="m-auto max-w-[240px] text-center text-[13px] leading-[1.5] text-brand-muted">{children}</div>
);

/** Una nota del sistema en el hilo: por qué no respondió. */
const Note = ({ children }: { children: ReactNode }) => (
    <div className="self-center max-w-[90%] text-center rounded-[10px] bg-brand-raised px-3 py-1 text-[11.5px] leading-[1.4] text-brand-gray-600">
        {children}
    </div>
);
