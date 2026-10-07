import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";

/** Los pasos; en móvil, una barra por paso y «Paso 1 de 3 · Destinatarios». */
const WizardStepper = ({ steps, current }: { steps: readonly string[]; current: number }) => {
    // Pasado el último, todos quedan hechos (importando, terminado).
    const shown = Math.min(current, steps.length);
    return (
        <>
            <ol className="hidden md:flex items-center gap-2.5">
                {steps.map((label, i) => {
                    const step = i + 1;
                    const done = step < current;
                    const active = step === current;
                    return (
                        <li key={label} className="flex items-center gap-2.5" aria-current={active ? 'step' : undefined}>
                            <span className={`w-6 h-6 rounded-full border-[1.5px] box-border flex items-center justify-center
                                font-mono text-xs font-semibold
                                ${done ? 'bg-brand-accent-soft border-brand-accent-soft text-brand-accent-strong'
                                    : active ? 'bg-brand-deep border-brand-deep text-white'
                                        : 'bg-brand-surface border-brand-border-strong text-brand-subtle'}`}>
                                {done ? <Check size={12} strokeWidth={3.5} /> : step}
                            </span>
                            <span className={`text-[13.5px] ${active ? 'font-bold text-brand-text' : done ? 'text-brand-strong' : 'text-brand-subtle'}`}>
                                {label}
                            </span>
                            {step < steps.length && <span className="w-9 h-px bg-brand-border-strong ml-1" />}
                        </li>
                    );
                })}
            </ol>
            <div className="md:hidden grid gap-2">
                <div className="grid grid-flow-col auto-cols-fr gap-1">
                    {steps.map((label, i) => (
                        <span key={label} className={`h-1 rounded-sm ${i + 1 < current ? 'bg-brand-success' : i + 1 === current ? 'bg-brand-deep' : 'bg-brand-border'}`} />
                    ))}
                </div>
                <span className="text-[13px] text-brand-gray-600">
                    Paso <span className="font-mono">{shown}</span> de <span className="font-mono">{steps.length}</span> ·{' '}
                    <b className="font-semibold text-brand-text">{steps[shown - 1]}</b>
                </span>
            </div>
        </>
    );
};

interface WizardHeaderProps {
    /** La sección de la que cuelga, para volver: «Campañas», «Contactos». */
    parent: { label: string; to: string };
    title: string;
    icon: ReactNode;
    description: string;
    steps: readonly string[];
    /** El paso en el que se está (desde 1). Uno más que el último = todos hechos. */
    step: number;
    /** A la derecha de los pasos: «Borrador guardado», el archivo elegido. */
    aside?: ReactNode;
}

/** Migas, título y pasos de un asistente de página entera (Nueva campaña, Importar contactos). */
export const WizardHeader = ({ parent, title, icon, description, steps, step, aside }: WizardHeaderProps) => (
    <>
        <nav className="flex items-center gap-1.5 text-[13px]">
            <Link to={parent.to} className="font-semibold text-brand-accent-strong hover:underline">{parent.label}</Link>
            <span className="text-brand-subtle">›</span>
            <span className="text-brand-gray-600">{title}</span>
        </nav>

        <header className="mt-3 flex items-center gap-4">
            <div className="w-10 h-10 rounded-[10px] bg-brand-accent-soft text-brand-accent-strong flex items-center justify-center flex-none">
                {icon}
            </div>
            <div className="min-w-0">
                <h1 className="text-[30px] font-bold tracking-[-0.03em] leading-none text-brand-text">{title}</h1>
                <p className="hidden sm:block text-[15px] text-brand-muted mt-2">{description}</p>
            </div>
        </header>

        <div className="mt-6 pb-4 mb-6 border-b border-brand-raised flex items-center gap-4">
            <div className="flex-1 min-w-0"><WizardStepper steps={steps} current={step} /></div>
            {aside && <div className="flex-none self-start md:self-center">{aside}</div>}
        </div>
    </>
);
