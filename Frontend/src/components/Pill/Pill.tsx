import type { ReactNode } from 'react';

export type PillTone = 'positive' | 'warning' | 'danger' | 'neutral' | 'outline';

// Los pares tinte/texto del manual (sección «Píldoras de estado»). `outline`
// es el neutro sobre blanco: para un estado que no pide atención.
const TONES: Record<PillTone, string> = {
    positive: 'bg-brand-accent-soft text-brand-accent-strong',
    warning:  'bg-brand-warning-soft text-brand-warning',
    danger:   'bg-brand-danger-soft text-brand-danger',
    neutral:  'bg-brand-raised text-brand-muted',
    outline:  'bg-brand-surface text-brand-muted border border-brand-border',
};

/** Píldora de estado del manual: 11px, negrita, mayúsculas. */
export const Pill = ({ tone = 'neutral', children }: { tone?: PillTone; children: ReactNode }) => (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase
        tracking-[0.05em] whitespace-nowrap ${TONES[tone]}`}>
        {children}
    </span>
);
