import type { ReactNode } from "react";

export interface NumberedStep {
    content: ReactNode;
    /** Un paso que no se hace aquí sino después (diseño A8: «Activar avisos», ya dentro de la app). */
    later?: boolean;
}

/** Pasos numerados de las guías de avisos: círculo verde profundo; el de «después», en menta suave. */
export const NumberedSteps = ({ steps, divided = false }: { steps: NumberedStep[]; divided?: boolean }) => (
    <ol className={`flex flex-col ${divided ? '' : 'gap-3'}`}>
        {steps.map((step, i) => (
            <li
                key={i}
                className={`flex gap-3 text-[15px] leading-[1.45] text-brand-strong
                    ${divided ? 'py-3 border-b border-brand-border last:border-b-0' : ''}`}
            >
                <span className={`flex-none w-[22px] h-[22px] mt-px rounded-full flex items-center justify-center
                    text-xs font-bold ${step.later
                        ? 'bg-brand-accent-soft text-brand-accent-strong'
                        : 'bg-brand-deep text-white'}`}>
                    {i + 1}
                </span>
                <span className="min-w-0">{step.content}</span>
            </li>
        ))}
    </ol>
);
