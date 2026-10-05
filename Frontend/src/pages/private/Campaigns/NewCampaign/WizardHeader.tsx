import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, Send } from "lucide-react";
import { CampaignPaths } from "../../../../models/routes.models";
import { CAMPAIGN_STEPS, type CampaignDraft } from "../../../../utils/campaignDraft";

type Step = CampaignDraft['step'];

/** Los tres pasos; en móvil, tres barras y «Paso 1 de 3 · Destinatarios». */
const WizardStepper = ({ current }: { current: Step }) => (
    <>
        <ol className="hidden md:flex items-center gap-2.5">
            {CAMPAIGN_STEPS.map((label, i) => {
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
                        {step < CAMPAIGN_STEPS.length && <span className="w-9 h-px bg-brand-border-strong ml-1" />}
                    </li>
                );
            })}
        </ol>
        <div className="md:hidden grid gap-2">
            <div className="grid grid-cols-3 gap-1">
                {CAMPAIGN_STEPS.map((label, i) => (
                    <span key={label} className={`h-1 rounded-sm ${i + 1 < current ? 'bg-brand-success' : i + 1 === current ? 'bg-brand-deep' : 'bg-brand-border'}`} />
                ))}
            </div>
            <span className="text-[13px] text-brand-gray-600">
                Paso <span className="font-mono">{current}</span> de <span className="font-mono">{CAMPAIGN_STEPS.length}</span> ·{' '}
                <b className="font-semibold text-brand-text">{CAMPAIGN_STEPS[current - 1]}</b>
            </span>
        </div>
    </>
);

/**
 * Migas, título y pasos de «Nueva campaña». Lo comparten el asistente y
 * Contactos cuando elige los destinatarios: así elegirlos se ve como el paso 1
 * de la campaña y no como otra sección.
 */
export const WizardHeader = ({ step, description, aside }: {
    step: Step;
    description: string;
    /** A la derecha de los pasos: «Borrador guardado», «Cancelar». */
    aside?: ReactNode;
}) => (
    <>
        <nav className="flex items-center gap-1.5 text-[13px]">
            <Link to={CampaignPaths.list} className="font-semibold text-brand-accent-strong hover:underline">Campañas</Link>
            <span className="text-brand-subtle">›</span>
            <span className="text-brand-gray-600">Nueva campaña</span>
        </nav>

        <header className="mt-3 flex items-center gap-4">
            <div className="w-10 h-10 rounded-[10px] bg-brand-accent-soft text-brand-accent-strong flex items-center justify-center flex-none">
                <Send size={20} />
            </div>
            <div className="min-w-0">
                <h1 className="text-[30px] font-bold tracking-[-0.03em] leading-none text-brand-text">Nueva campaña</h1>
                <p className="hidden sm:block text-[15px] text-brand-muted mt-2">{description}</p>
            </div>
        </header>

        <div className="mt-6 pb-4 mb-6 border-b border-brand-raised flex items-center gap-4">
            <div className="flex-1 min-w-0"><WizardStepper current={step} /></div>
            {aside && <div className="flex-none self-start md:self-center">{aside}</div>}
        </div>
    </>
);
