import type { ReactNode } from 'react';

export type PillTone = 'positive' | 'info' | 'warning' | 'danger' | 'neutral' | 'outline';

// Los pares tinte/texto del manual (sección «Píldoras de estado»). `info` es
// lo que está en curso; `outline`, el neutro sobre blanco: para un estado que
// no pide atención.
const TONES: Record<PillTone, string> = {
    positive: 'bg-brand-accent-soft text-brand-accent-strong',
    info:     'bg-brand-info-soft text-brand-info',
    warning:  'bg-brand-warning-soft text-brand-warning',
    danger:   'bg-brand-danger-soft text-brand-danger',
    neutral:  'bg-brand-raised text-brand-muted',
    outline:  'bg-brand-surface text-brand-muted border border-brand-border',
};

/** Píldora de estado del manual: 11px, negrita, mayúsculas, con un icono opcional delante. */
export const Pill = ({ tone = 'neutral', icon, children }: { tone?: PillTone; icon?: ReactNode; children: ReactNode }) => (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase
        tracking-[0.05em] whitespace-nowrap ${TONES[tone]}`}>
        {icon}
        {children}
    </span>
);
