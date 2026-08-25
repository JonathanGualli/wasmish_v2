import type { ReactNode } from 'react';

type CalloutTone = 'info' | 'warning' | 'danger';

const TONES: Record<CalloutTone, { bar: string; icon: string; bg: string }> = {
    // Reutiliza el patrón de «nota interna» del manual: barra de 3px a la
    // izquierda sobre un fondo tenue. Los tintes salen del propio manual.
    info:    { bar: 'border-l-brand-accent',  icon: 'text-brand-accent-strong', bg: 'bg-brand-bg' },
    warning: { bar: 'border-l-brand-warning', icon: 'text-brand-warning',       bg: 'bg-brand-warning-soft' },
    danger:  { bar: 'border-l-brand-danger',  icon: 'text-brand-danger',        bg: 'bg-brand-danger-soft' },
};

export const Callout = ({
    tone = 'info',
    icon,
    title,
    children,
}: {
    tone?: CalloutTone;
    icon: ReactNode;
    title?: string;
    children: ReactNode;
}) => {
    const t = TONES[tone];
    return (
        <div className={`flex gap-3 border border-brand-border border-l-[3px] ${t.bar} ${t.bg}
            rounded-r-xl px-4 py-3.5`}>
            <span className={`${t.icon} flex-none mt-0.5`}>{icon}</span>
            <div className="min-w-0">
                {title && (
                    <h4 className="text-[15px] font-semibold text-brand-text mb-1">{title}</h4>
                )}
                <div className="text-sm leading-[1.6] text-brand-muted">{children}</div>
            </div>
        </div>
    );
};
