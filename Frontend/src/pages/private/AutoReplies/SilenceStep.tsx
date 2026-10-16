import { HANDOFF_HOURS } from "../../../models/autoReply.model";
import type { AutoReplyEditor } from "./useAutoReplyEditor";

/** Cuándo se calla: las horas tras una respuesta manual, y lo que no repite nunca. */
export const SilenceStep = ({ editor }: { editor: AutoReplyEditor }) => (
    <div className="max-w-[720px] border border-brand-border rounded-[10px] overflow-hidden divide-y divide-brand-raised">
        <div className="bg-brand-surface p-3.5 flex flex-wrap items-center gap-3">
            <span id="handoff-label" className="flex-1 min-w-[220px] text-sm leading-[1.5] text-brand-text">
                Cuando alguien del equipo responde a mano, el bot se calla en esa conversación durante
            </span>
            <div role="radiogroup" aria-labelledby="handoff-label" className="flex gap-0.5 p-[3px] rounded-[9px] bg-brand-bg">
                {HANDOFF_HOURS.map(hours => {
                    const selected = editor.form.handoffHours === hours;
                    return (
                        <button
                            key={hours}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => editor.setHandoffHours(hours)}
                            className={`px-[11px] py-1.5 rounded-[7px] text-[13px] cursor-pointer transition-colors
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
        <SilenceRow title="Palabras clave">Cada regla, una vez cada 24 horas por conversación.</SilenceRow>
        <SilenceRow title="Fuera de horario">Una vez por cierre, no a cada mensaje.</SilenceRow>
        <SilenceRow title="Ráfagas">Como mucho 3 respuestas en 10 minutos por conversación, para no contestarle a otro bot sin parar.</SilenceRow>
    </div>
);

const SilenceRow = ({ title, children }: { title: string; children: string }) => (
    <div className="bg-brand-surface px-3.5 py-3 flex flex-col sm:flex-row gap-1 sm:gap-2.5 text-[13.5px] text-brand-gray-600">
        <span className="flex-none sm:w-[140px] font-semibold text-brand-strong">{title}</span>
        {children}
    </div>
);
