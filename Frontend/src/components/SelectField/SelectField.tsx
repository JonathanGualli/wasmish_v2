import { useId, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectFieldProps<T extends string> {
    label: ReactNode;
    value: T;
    options: { value: T; label: string }[];
    onChange: (value: T) => void;
}

/**
 * Lista desplegable nativa con el aspecto de `AuthField`: en móvil abre el
 * selector del sistema, que es el más cómodo con el dedo.
 */
export const SelectField = <T extends string>({ label, value, options, onChange }: SelectFieldProps<T>) => {
    const id = useId();
    return (
        // content-start: junto a un campo con error (más alto), la caja no baja.
        <div className="grid content-start gap-[7px] min-w-0">
            <label htmlFor={id} className="text-[13px] font-semibold text-brand-strong">{label}</label>
            <div className="relative">
                <select
                    id={id}
                    value={value}
                    onChange={e => onChange(e.target.value as T)}
                    className="w-full appearance-none box-border text-base lg:text-[15px] text-brand-text cursor-pointer
                        bg-brand-surface border border-brand-border-strong rounded-[10px] lg:rounded-[8px]
                        pl-[14px] pr-10 py-[15px] lg:py-[13px]
                        focus:outline-none focus:border-brand-success focus:ring-[3px] focus:ring-brand-accent-soft
                        transition-colors"
                >
                    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
            </div>
        </div>
    );
};
