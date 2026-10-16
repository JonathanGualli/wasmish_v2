import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { STEP_TITLES, type StepKey } from "../../../utils/autoReplyForm";
import { stepIsOn, stepSummary } from "./stepState";
import type { AutoReplyEditor } from "./useAutoReplyEditor";

const DOT = {
    on: { text: 'text-brand-accent-strong', dot: 'bg-brand-success' },
    off: { text: 'text-brand-muted', dot: 'bg-brand-border-strong' },
    error: { text: 'text-brand-danger', dot: 'bg-brand-danger' },
};

/** «● Encendida»: el estado de un paso, con su punto de color. */
export const StatusDot = ({ tone, children }: { tone: keyof typeof DOT; children: ReactNode }) => (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${DOT[tone].text}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${DOT[tone].dot}`} />{children}
    </span>
);

/** El estado que se ve en la barra (y en la lista del teléfono): errores, encendida o apagada. */
export const StepStatus = ({ editor, step }: { editor: AutoReplyEditor; step: StepKey }) => {
    const errors = editor.showIssues ? editor.counts[step] : 0;
    if (errors > 0) return <StatusDot tone="error">{errors} {errors === 1 ? 'error' : 'errores'}</StatusDot>;
    const on = stepIsOn(editor, step);
    if (on === null) return null;
    return <StatusDot tone={on ? 'on' : 'off'}>{on ? 'Encendida' : 'Apagada'}</StatusDot>;
};

/**
 * Los pasos en una barra horizontal. Configurada, son pestañas: cada uno dice si
 * está encendido y qué tiene. En el asistente, van en orden: los ya hechos
 * llevan ✓ y se puede volver a ellos; los siguientes, «Pendiente».
 */
export const StepBar = ({ editor }: { editor: AutoReplyEditor }) => {
    const wizard = editor.mode === 'wizard';
    const current = editor.steps.indexOf(editor.step);

    return (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${editor.steps.length}, minmax(0, 1fr))` }} role="tablist">
            {editor.steps.map((step, index) => {
                const active = index === current;
                const done = wizard && index < current;
                const reachable = !wizard || index <= editor.reached;
                const errors = editor.showIssues ? editor.counts[step] : 0;
                const summary = wizard && index > current && index > editor.reached
                    ? (step === 'review' ? 'Último paso' : 'Pendiente')
                    : stepSummary(editor, step);

                return (
                    <button
                        key={step}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        disabled={!reachable}
                        onClick={() => editor.goTo(step)}
                        className={`grid grid-cols-[26px_minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 items-center text-left px-3.5 py-[11px] rounded-[10px]
                            transition-colors cursor-pointer disabled:cursor-default
                            focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-accent-soft
                            ${active
                                ? 'border-[1.5px] border-brand-accent-strong bg-brand-green-50'
                                : errors > 0 ? 'border border-brand-danger-border bg-brand-danger-soft'
                                    : 'border border-brand-border bg-brand-surface enabled:hover:bg-brand-bg'}`}
                    >
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs font-semibold
                            ${done ? 'bg-brand-accent-strong text-white'
                                : active ? 'bg-brand-deep text-white'
                                    : 'border border-brand-border-strong bg-brand-surface text-brand-gray-600'}`}>
                            {done ? <Check size={12} strokeWidth={3.4} /> : index + 1}
                        </span>
                        <span className={`text-[14.5px] text-brand-text truncate ${active ? 'font-bold' : 'font-semibold'}`}>{STEP_TITLES[step]}</span>
                        {/* En pantallas medianas no cabe «Encendida»; los errores se ven siempre. */}
                        <span className={errors > 0 ? '' : 'hidden xl:inline'}>
                            {wizard
                                ? done && <StatusDot tone="on">Listo</StatusDot>
                                : <StepStatus editor={editor} step={step} />}
                        </span>
                        <span className="col-start-2 col-span-2 text-[12.5px] text-brand-muted truncate">{summary}</span>
                    </button>
                );
            })}
        </div>
    );
};
