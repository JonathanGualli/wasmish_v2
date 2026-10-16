import { Info } from "lucide-react";
import { HANDOFF_HOURS } from "../../../models/autoReply.model";
import type { AutoReplyEditor } from "./useAutoReplyEditor";

/**
 * Cuándo se calla. Arriba, lo único que se elige: las horas tras una respuesta
 * manual. Debajo, aparte y con aspecto de explicación (no de control), lo que
 * el bot hace siempre para no repetirse.
 */
export const SilenceStep = ({ editor }: { editor: AutoReplyEditor }) => (
    <div className="max-w-[720px] grid gap-6">
        <div className="border border-brand-border rounded-[10px] bg-brand-surface p-4 grid gap-3">
            <span id="handoff-label" className="text-[13.5px] font-semibold text-brand-strong">
                Cuando alguien del equipo responde a mano, el bot se calla en esa conversación durante
            </span>
            <div role="radiogroup" aria-labelledby="handoff-label" className="justify-self-start flex gap-0.5 p-[3px] rounded-[9px] bg-brand-bg">
                {HANDOFF_HOURS.map(hours => {
                    const selected = editor.form.handoffHours === hours;
                    return (
                        <button
                            key={hours}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => editor.setHandoffHours(hours)}
                            className={`px-3.5 py-1.5 rounded-[7px] text-[13px] cursor-pointer transition-colors
                                ${selected
                                    ? 'bg-brand-surface font-semibold text-brand-text shadow-[0_1px_2px_rgba(14,17,22,0.12)]'
                                    : 'font-medium text-brand-muted hover:text-brand-text'}`}
                        >
                            {hours} h
                        </button>
                    );
                })}
            </div>
        </div>

        <section aria-labelledby="silence-rules" className="grid gap-2.5">
            <div className="flex items-center gap-2">
                <Info size={15} className="text-brand-muted" />
                <h3 id="silence-rules" className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-muted">
                    Además, siempre
                </h3>
            </div>
            <p className="text-[13px] leading-[1.5] text-brand-muted">
                No se configuran: es lo que hace el bot para no repetirse ni contestar sin parar.
            </p>
            <ul className="grid gap-2 text-[13.5px] leading-[1.5] text-brand-gray-600">
                <SilenceRule title="Palabras clave">Cada regla, una vez cada 24 horas por conversación.</SilenceRule>
                <SilenceRule title="Fuera de horario">Una vez por cierre, no a cada mensaje.</SilenceRule>
                <SilenceRule title="Ráfagas">Como mucho 3 respuestas en 10 minutos por conversación, para no contestarle a otro bot sin parar.</SilenceRule>
            </ul>
        </section>
    </div>
);

const SilenceRule = ({ title, children }: { title: string; children: string }) => (
    <li className="flex gap-2.5">
        <span className="flex-none mt-[9px] w-1 h-1 rounded-full bg-brand-subtle" />
        <span><b className="font-semibold text-brand-strong">{title}:</b> {children}</span>
    </li>
);
