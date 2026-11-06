import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { CustomButton } from "../../../components/Button/Button";
import { useLines } from "../../../hooks/useLines";
import { WIZARD_STEPS, WIZARD_STEP_TITLES, scheduleDescription, type WizardStep } from "../../../utils/autoReplyForm";
import type { AutoReplyEditor } from "./useAutoReplyEditor";
import { OutOfHoursStep } from "./OutOfHoursStep";
import { SilenceStep } from "./SilenceStep";
import { StatusDot } from "./StepBar";
import { Switch } from "./Switch";

/*
 * El asistente de la primera vez (diseño «Respuestas automáticas v4 - Lienzo»,
 * 4f): cuatro pasos en una tarjeta. En la computadora va encima del lienzo,
 * con «Probar» a la derecha; en pantallas más estrechas, solo. El diseño
 * dibuja el paso 1; los demás siguen su forma y reutilizan los pasos de la
 * página (`OutOfHoursStep`, `SilenceStep`).
 */

/** Los botones del menú de ejemplo, como se ven en el paso 1 (los crea `exampleMenu`). */
const EXAMPLE_BUTTONS = ['Precios', 'Horarios', 'Hablar con alguien'];

const NEXT_HINT: Record<WizardStep, string | null> = {
    greeting: 'Luego: horario, cuándo se calla y encender.',
    outOfHours: 'Luego: cuándo se calla y encender.',
    silence: 'Luego: encender.',
    turnOn: null,
};

/** En cuántas líneas contesta: lo que se enciende es de la cuenta. */
const linesPhrase = (count: number) => {
    if (count === 0) return 'Contestará en cuanto conectes tu número.';
    return `Desde ahora contesta solo en ${count === 1 ? 'tu línea' : `tus ${count} líneas`}.`;
};

/** «Paso 1 de 4» y «Terminar luego», para la barra de arriba de la página. */
export const WizardBarActions = ({ editor }: { editor: AutoReplyEditor }) => (
    <>
        <span className="font-mono tabular-nums text-[12.5px] text-brand-muted whitespace-nowrap">
            Paso {WIZARD_STEPS.indexOf(editor.wizardStep) + 1} de {WIZARD_STEPS.length}
        </span>
        <div className="h-[38px]"><CustomButton variant="outline" onClick={editor.finishLater} isLoading={editor.isSaving}>Terminar luego</CustomButton></div>
    </>
);

/**
 * La tarjeta del asistente. `contained`: encima del lienzo, con el alto de lo
 * que tiene detrás (el paso se desplaza dentro); si no, crece con la página.
 */
export const SetupWizard = ({ editor, contained }: { editor: AutoReplyEditor; contained: boolean }) => {
    const { activeLines } = useLines();
    const step = editor.wizardStep;
    const index = WIZARD_STEPS.indexOf(step);
    const hint = NEXT_HINT[step];
    const wideStep = step === 'outOfHours' || step === 'silence';

    const header: Record<WizardStep, { title: string; description: ReactNode }> = {
        greeting: {
            title: '¿Cómo quieres saludar?',
            description: `Con botones, quien escribe no tiene que adivinar qué palabra usar. Puedes cambiar todo después${contained ? ' en el lienzo' : ''}.`,
        },
        outOfHours: { title: 'Fuera de horario', description: 'A quien escribe con el negocio cerrado. Se suma a lo que responda el menú.' },
        silence: { title: 'Cuándo se calla', description: 'Para que no conteste encima de una persona ni repita lo mismo.' },
        turnOn: {
            title: 'Todo listo para encender',
            description: `${linesPhrase(activeLines.length)} Cada respuesta automática es un mensaje que Meta cobra; cada número tiene unos 1.000 gratis al mes.`,
        },
    };

    const cta = {
        greeting: { label: editor.withMenu ? 'Usar este menú' : 'Seguir sin botones', onClick: editor.next },
        outOfHours: { label: 'Siguiente', onClick: editor.next },
        silence: { label: 'Siguiente', onClick: editor.next },
        turnOn: { label: 'Encender y guardar', onClick: editor.turnOnAndSave },
    }[step];

    return (
        <section aria-label="Configuración inicial"
            className={`w-full ${wideStep ? 'max-w-[760px]' : 'max-w-[600px]'} flex flex-col bg-brand-surface border border-brand-border rounded-2xl
                ${contained ? 'max-h-full shadow-[0_24px_60px_rgba(14,17,22,0.16)]' : ''}`}>
            <div className="flex-none flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 px-5 sm:px-7 pt-[26px] pb-[18px]">
                <div className="flex-1 min-w-0">
                    <div className="font-mono text-[11.5px] tracking-[0.1em] uppercase text-brand-muted">
                        Paso {index + 1} de {WIZARD_STEPS.length} · {WIZARD_STEP_TITLES[step]}
                    </div>
                    <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.03em] text-brand-text">{header[step].title}</h2>
                    <p className="mt-1.5 text-[14.5px] leading-[1.55] text-brand-gray-600">{header[step].description}</p>
                </div>
                {step === 'outOfHours' && (
                    <span className="flex-none sm:pt-6 flex items-center gap-2.5 text-[13.5px] font-semibold text-brand-strong">
                        {editor.form.outOfHours.enabled ? 'Encendido' : 'Apagado'}
                        <Switch checked={editor.form.outOfHours.enabled} disabled={editor.isSaving} label="Fuera de horario encendido"
                            onChange={(enabled) => editor.setOutOfHours({ enabled })} />
                    </span>
                )}
            </div>

            <div className={`@container px-5 sm:px-7 ${contained ? 'flex-1 min-h-0 overflow-y-auto' : ''}`}>
                <fieldset disabled={editor.isSaving} className="contents">
                    {step === 'greeting' && <GreetingChoices editor={editor} />}
                    {step === 'outOfHours' && <OutOfHoursStep editor={editor} />}
                    {step === 'silence' && <SilenceStep editor={editor} />}
                    {step === 'turnOn' && <TurnOnSummary editor={editor} contained={contained} />}
                </fieldset>
            </div>

            <div className="flex-none flex flex-wrap items-center gap-2.5 px-5 sm:px-7 pt-[18px] pb-[26px]">
                {index > 0 && (
                    <div className="h-[42px]"><CustomButton variant="outline" onClick={editor.previous}><ArrowLeft size={15} /> Anterior</CustomButton></div>
                )}
                {hint && <span className="hidden sm:inline text-[13px] text-brand-muted">{hint}</span>}
                <div className="ml-auto h-[42px]">
                    {/* En menta, como dice la marca, aunque el diseño lo pinta oscuro (decisiones, 2026-10-15). */}
                    <CustomButton onClick={cta.onClick}
                        isLoading={step === 'turnOn' && editor.isSaving}>
                        {cta.label}
                    </CustomButton>
                </div>
            </div>
        </section>
    );
};

/** Paso 1: con el menú de ejemplo (recomendado) o solo el saludo. Se ve al momento en «Probar». */
const GreetingChoices = ({ editor }: { editor: AutoReplyEditor }) => {
    const choices = [
        {
            menu: true, title: 'Con un menú de ejemplo', recommended: true, buttons: EXAMPLE_BUTTONS,
            description: 'La bienvenida con tres botones. «Precios» y «Horarios» quedan creadas para que pongas tus textos.',
        },
        {
            menu: false, title: 'Solo el saludo', recommended: false, buttons: null,
            description: 'Un mensaje sin botones, como hasta ahora. Puedes añadir el menú después.',
        },
    ];
    return (
        <div role="radiogroup" aria-label="¿Cómo quieres saludar?" className="grid gap-[18px]">
            {choices.map(choice => {
                const selected = editor.withMenu === choice.menu;
                return (
                    <button key={choice.title} type="button" role="radio" aria-checked={selected} onClick={() => editor.chooseGreeting(choice.menu)}
                        className={`grid grid-cols-[18px_minmax(0,1fr)] gap-3 px-4 py-3.5 rounded-xl text-left cursor-pointer transition-colors
                            ${selected ? 'border-[1.5px] border-brand-accent-strong bg-brand-green-50' : 'border border-brand-border bg-brand-surface hover:bg-brand-bg'}`}>
                        <span className={`mt-0.5 w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center
                            ${selected ? 'border-brand-accent-strong' : 'border-brand-border-strong'}`}>
                            {selected && <span className="w-2 h-2 rounded-full bg-brand-accent-strong" />}
                        </span>
                        <span className="grid gap-2 min-w-0">
                            <span>
                                <span className="flex flex-wrap items-center gap-2">
                                    <span className="text-[15px] font-bold text-brand-text">{choice.title}</span>
                                    {choice.recommended && (
                                        <span className="rounded-full px-2 py-0.5 bg-brand-accent-soft text-brand-accent-strong text-[11px] font-bold uppercase tracking-[0.05em]">
                                            Recomendado
                                        </span>
                                    )}
                                </span>
                                <span className="block mt-[3px] text-[13.5px] leading-[1.5] text-brand-gray-600">{choice.description}</span>
                            </span>
                            {choice.buttons && (
                                <span className="flex flex-wrap gap-1.5">
                                    {choice.buttons.map(button => (
                                        <span key={button} className="h-8 px-3.5 rounded-lg bg-brand-surface border border-brand-border-strong flex items-center
                                            text-[13.5px] font-semibold text-brand-accent-strong">{button}</span>
                                    ))}
                                </span>
                            )}
                        </span>
                    </button>
                );
            })}
        </div>
    );
};

/** Paso 4: así queda, con «Editar» para volver a cada paso. */
const TurnOnSummary = ({ editor, contained }: { editor: AutoReplyEditor; contained: boolean }) => {
    const { form, withMenu } = editor;
    const rows: { title: string; on: boolean; status: string; summary: string; step?: WizardStep }[] = [
        {
            title: 'Bienvenida', on: true, status: 'Encendida', step: 'greeting',
            summary: withMenu ? `Con 3 botones: ${EXAMPLE_BUTTONS.slice(0, -1).join(', ')} y ${EXAMPLE_BUTTONS[EXAMPLE_BUTTONS.length - 1]}.` : 'Solo el saludo, sin botones.',
        },
        {
            title: 'Fuera de horario', on: form.outOfHours.enabled, status: form.outOfHours.enabled ? 'Encendido' : 'Apagado', step: 'outOfHours',
            summary: form.outOfHours.enabled ? scheduleDescription(form.outOfHours.schedule) : 'No avisa cuando el negocio está cerrado.',
        },
        {
            title: 'Cuándo se calla', on: true, status: `${form.handoffHours} horas`, step: 'silence',
            summary: 'Tras una respuesta manual del equipo, en esa conversación.',
        },
        {
            title: 'Si no entiende', on: true, status: 'Encendido',
            summary: `Una vez cada ${form.handoffHours} h por conversación${withMenu ? ', con los mismos botones' : ''}.`,
        },
    ];
    return (
        <div className="grid gap-3">
            <div className="border border-brand-border rounded-[10px] divide-y divide-brand-raised">
                {rows.map(row => (
                    <div key={row.title} className="px-4 py-3 grid gap-1">
                        <div className="flex items-center gap-2.5">
                            <span className="text-[14.5px] font-bold text-brand-text">{row.title}</span>
                            <StatusDot tone={row.on ? 'on' : 'off'}>{row.status}</StatusDot>
                            {row.step && (
                                <button type="button" onClick={() => editor.goToWizardStep(row.step!)}
                                    className="ml-auto text-[13px] font-semibold text-brand-accent-strong hover:underline cursor-pointer">
                                    Editar
                                </button>
                            )}
                        </div>
                        <div className="text-[13px] leading-[1.5] text-brand-gray-600">{row.summary}</div>
                    </div>
                ))}
            </div>
            {withMenu && (
                <p className="text-[13px] leading-[1.5] text-brand-muted">
                    «Precios» y «Horarios» llevan textos de ejemplo: cámbialos {contained ? 'en el lienzo' : 'en esta página'} cuando quieras.
                </p>
            )}
        </div>
    );
};
