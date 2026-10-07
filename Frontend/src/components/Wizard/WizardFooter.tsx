import type { ReactNode } from "react";
import { CustomButton } from "../Button/Button";

const HINT_TONE = { muted: 'text-brand-muted', warning: 'text-brand-warning', danger: 'text-brand-danger' };

interface WizardFooterProps {
    /** Qué falta para seguir, o qué va a pasar. En móvil no sale: no cabe junto a los botones. */
    hint: ReactNode;
    hintTone?: keyof typeof HINT_TONE;
    /** «Atrás», «Salir». */
    back?: { label: string; onClick: () => void };
    /** La acción principal del paso: la única en menta. */
    next?: { label: ReactNode; onClick: () => void; disabled?: boolean; isLoading?: boolean };
}

/** El pie fijo de un asistente: la pista a la izquierda y los botones a la derecha. */
export const WizardFooter = ({ hint, hintTone = 'muted', back, next }: WizardFooterProps) => (
    <footer className="sticky bottom-0 z-10 bg-brand-surface border-t border-brand-border
        shadow-[0_-8px_20px_rgba(14,17,22,0.04)]">
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
            <span className={`hidden sm:block flex-1 min-w-0 text-[13px] ${HINT_TONE[hintTone]}`}>{hint}</span>
            <div className="flex gap-2">
                {back && (
                    <div className={`h-11 sm:h-[42px] ${next ? '' : 'flex-1 sm:flex-none'}`}>
                        <CustomButton variant="outline" onClick={back.onClick}>{back.label}</CustomButton>
                    </div>
                )}
                {next && (
                    <div className="h-11 sm:h-[42px] flex-1 sm:flex-none">
                        <CustomButton onClick={next.onClick} disabled={next.disabled} isLoading={next.isLoading}>{next.label}</CustomButton>
                    </div>
                )}
            </div>
        </div>
    </footer>
);
