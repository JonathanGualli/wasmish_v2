/**
 * Barra de progreso. Menta solo mientras avanza (`active`): parada o pausada
 * va en gris, para que el único acento vivo sea lo que está pasando ahora.
 */
export const ProgressBar = ({ percent, active, size = 'sm' }: {
    percent: number;
    active: boolean;
    size?: 'sm' | 'md';
}) => (
    <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className={`${size === 'md' ? 'h-2.5 rounded-[5px]' : 'h-1.5 rounded-[3px]'} bg-brand-raised overflow-hidden`}
    >
        <div
            className={`h-full rounded-[inherit] transition-[width] duration-500 ${active ? 'bg-brand-accent' : 'bg-brand-border-strong'}`}
            style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }}
        />
    </div>
);
