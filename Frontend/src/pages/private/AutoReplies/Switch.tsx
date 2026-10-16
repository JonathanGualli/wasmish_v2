const SIZES = {
    sm: { track: 'w-7 h-4', knob: 'w-3 h-3', on: 'translate-x-3' },
    md: { track: 'w-9 h-5', knob: 'w-4 h-4', on: 'translate-x-4' },
    lg: { track: 'w-12 h-7', knob: 'w-[22px] h-[22px]', on: 'translate-x-[22px]' },
};

/**
 * Un interruptor (diseño «Respuestas automáticas v2»): encendido en verde, apagado en gris.
 * `size` cambia el dibujo; el área de toque es siempre de 44 px de alto.
 */
export const Switch = ({ checked, onChange, label, size = 'md', disabled = false }: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    /** Para el lector de pantalla, si no hay texto visible al lado. */
    label: string;
    size?: keyof typeof SIZES;
    disabled?: boolean;
}) => {
    const s = SIZES[size];
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={(event) => { event.stopPropagation(); onChange(!checked); }}
            className="flex-none -my-3 py-3 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        >
            <span className={`flex items-center p-0.5 rounded-full transition-colors ${s.track}
                ${checked ? 'bg-brand-accent-strong' : 'bg-brand-border-strong'}`}>
                <span className={`rounded-full bg-brand-surface shadow-[0_1px_2px_rgba(14,17,22,0.25)] transition-transform
                    ${s.knob} ${checked ? s.on : 'translate-x-0'}`} />
            </span>
        </button>
    );
};
