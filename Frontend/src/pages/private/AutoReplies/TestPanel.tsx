import { useMemo, useRef, useState } from "react";
import { Check, Send } from "lucide-react";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { usePreviewAutoReply } from "../../../hooks/useAutoReplies";
import { useAutosizeTextarea } from "../../../hooks/useAutosizeTextarea";
import { clockIn, matchedKeyword, toPayload } from "../../../utils/autoReplyForm";
import { SkeletonBox } from "../../../components/Skeleton/Skeleton";
import type { AutoReplyEditor } from "./useAutoReplyEditor";

interface Reason {
    ok: boolean;
    title: string;
    detail: string;
}

/**
 * «Probar»: qué respondería ahora, con lo que hay en pantalla y sin guardar,
 * a un contacto nuevo (así la bienvenida sale si está encendida). Tras probar
 * un mensaje, cada cambio en la página lo vuelve a preguntar solo.
 * Con errores marcados no prueba: el backend valida la configuración entera.
 */
export const TestPanel = ({ editor }: { editor: AutoReplyEditor }) => {
    const { form } = editor;
    const [message, setMessage] = useState('');
    const [tested, setTested] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);
    useAutosizeTextarea(inputRef, message, 96);

    const settings = useDebouncedValue(useMemo(() => toPayload(form), [form]), 400);
    const blocked = editor.issueTotal > 0;
    const preview = usePreviewAutoReply(settings, tested, !blocked);
    const clock = clockIn(form.timezone);

    const send = () => {
        if (message.trim()) setTested(message.trim());
    };

    const reasons = useMemo((): Reason[] => {
        const result = preview.data;
        if (!result) return [];
        const list: Reason[] = [];
        list.push(form.welcome.enabled
            ? { ok: true, title: 'Bienvenida', detail: 'contacto nuevo.' }
            : { ok: false, title: 'Bienvenida', detail: 'apagada.' });
        if (form.keywordRules.length === 0) list.push({ ok: false, title: 'Palabras clave', detail: 'aún no hay reglas.' });
        else if (result.matchedRuleIndexes.length === 0) list.push({ ok: false, title: 'Palabras clave', detail: 'ninguna regla coincidió.' });
        for (const index of result.matchedRuleIndexes) {
            const rule = form.keywordRules[index];
            const phrase = rule && matchedKeyword(rule, tested);
            list.push({ ok: true, title: `Regla ${index + 1}`, detail: phrase ? `coincidió «${phrase}».` : 'coincidió.' });
        }
        list.push(!form.outOfHours.enabled
            ? { ok: false, title: 'Fuera de horario', detail: 'apagado.' }
            : result.outOfHours
                ? { ok: true, title: 'Fuera de horario', detail: 'ahora está cerrado.' }
                : { ok: false, title: 'Fuera de horario', detail: 'ahora está abierto.' });
        return list;
    }, [preview.data, form, tested]);

    return (
        <div className="flex flex-col gap-3 min-h-0 h-full">
            <div className="flex-none">
                <div className="flex items-center">
                    <span className="text-base font-bold text-brand-text">Probar</span>
                    <span className="ml-auto rounded-full bg-brand-bg px-[9px] py-1 text-[11px] font-bold uppercase tracking-[0.05em] text-brand-gray-600">
                        Sin guardar
                    </span>
                </div>
                <div className="mt-[3px] text-[12.5px] leading-[1.5] text-brand-muted">Con lo que hay en pantalla, como a un contacto nuevo.</div>
            </div>

            <div className="flex-none flex gap-1.5 items-end">
                <textarea
                    ref={inputRef}
                    rows={1}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            send();
                        }
                    }}
                    aria-label="Mensaje de prueba"
                    placeholder="Escribe un mensaje de ejemplo…"
                    className="flex-1 min-w-0 resize-none rounded-[9px] border border-brand-border-strong bg-brand-surface px-[11px] py-[9px]
                        text-base sm:text-[13.5px] leading-[1.4] text-brand-text placeholder:text-brand-subtle
                        focus:outline-none focus:border-brand-success focus:ring-[3px] focus:ring-brand-accent-soft"
                />
                <button type="button" onClick={send} disabled={!message.trim()} title="Probar" aria-label="Probar este mensaje"
                    className="flex-none w-[38px] h-[38px] rounded-[9px] bg-brand-deep text-white flex items-center justify-center
                        hover:bg-brand-deep-hover transition-colors cursor-pointer disabled:bg-brand-raised disabled:text-brand-subtle disabled:cursor-not-allowed">
                    <Send size={15} />
                </button>
            </div>

            <div className="flex-none text-[11.5px] font-semibold uppercase tracking-[0.08em] text-brand-muted">Respondería ahora · {clock.when}</div>

            <div className="flex-1 min-h-[160px] overflow-y-auto rounded-[10px] bg-brand-bg px-2.5 py-3 flex flex-col gap-2" aria-live="polite">
                {blocked ? (
                    <Hint>Corrige lo marcado para probar.</Hint>
                ) : !tested ? (
                    <Hint>Escribe un mensaje como lo haría un cliente, por ejemplo «hola, cuánto está y dónde quedan?».</Hint>
                ) : (
                    <>
                        <div className="self-start max-w-[85%] bg-brand-surface rounded-[10px_10px_10px_3px] px-2.5 py-[7px] text-[13px] leading-[1.45] text-brand-text whitespace-pre-wrap break-words">
                            {tested}
                        </div>
                        {preview.isError ? (
                            <Hint>No se pudo probar. Inténtalo de nuevo.</Hint>
                        ) : !preview.data ? (
                            <SkeletonBox className="self-end w-[70%] h-20 rounded-[10px_10px_3px_10px]" tone="bubble-own" />
                        ) : preview.data.reply ? (
                            <div className={`self-end max-w-[94%] bg-brand-accent-soft rounded-[10px_10px_3px_10px] px-2.5 pt-2 pb-1.5 grid gap-[7px]
                                text-[13px] leading-[1.45] text-brand-text transition-opacity ${preview.isPlaceholderData ? 'opacity-60' : ''}`}>
                                {preview.data.parts.map((part, index) => <div key={index} className="whitespace-pre-wrap break-words">{part}</div>)}
                                <div className="justify-self-end flex gap-[5px] font-mono text-[11px] text-brand-gray-600">
                                    <span>{clock.time}</span><span>·</span><span className="font-sans font-bold text-brand-accent-strong">Bot</span>
                                </div>
                            </div>
                        ) : (
                            <Hint>No respondería nada a este mensaje.</Hint>
                        )}
                    </>
                )}
            </div>

            {!blocked && tested && reasons.length > 0 && (
                <div className="flex-none grid">
                    {reasons.map((reason, index) => (
                        <div key={index} className="grid grid-cols-[16px_minmax(0,1fr)] gap-2 py-1.5 border-t border-brand-raised text-[12.5px] leading-[1.4]">
                            {reason.ok
                                ? <span className="mt-px w-3.5 h-3.5 rounded-full bg-brand-accent-strong text-white flex items-center justify-center"><Check size={9} strokeWidth={3.6} /></span>
                                : <span className="mt-px w-3.5 h-3.5 rounded-full border-[1.5px] border-brand-border-strong" />}
                            <span>
                                <b className={`font-semibold ${reason.ok ? 'text-brand-text' : 'text-brand-muted'}`}>{reason.title}</b>{' '}
                                <span className="text-brand-muted">{reason.detail}</span>
                            </span>
                        </div>
                    ))}
                </div>
            )}

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
