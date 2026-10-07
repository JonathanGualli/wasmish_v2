import { useId, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectFieldProps<T extends string> {
    label: ReactNode;
    value: T;
    options: { value: T; label: string }[];
    onChange: (value: T) => void;
    /** La etiqueta solo para lectores de pantalla: en una tabla, el nombre ya está en otra columna. */
    labelHidden?: boolean;
    /** Delante del valor, dentro de la caja. */
    icon?: ReactNode;
    invalid?: boolean;
}

/**
 * Lista desplegable nativa con el aspecto de `AuthField`: en móvil abre el
 * selector del sistema, que es el más cómodo con el dedo.
 */
export const SelectField = <T extends string>({ label, value, options, onChange, labelHidden = false, icon, invalid = false }: SelectFieldProps<T>) => {
    const id = useId();
    return (
        // content-start: junto a un campo con error (más alto), la caja no baja.
        <div className="grid content-start gap-[7px] min-w-0">
            <label htmlFor={id} className={labelHidden ? 'sr-only' : 'text-[13px] font-semibold text-brand-strong'}>{label}</label>
            <div className="relative">
                {icon && <span className="absolute left-3.5 top-1/2 -translate-y-1/2 flex pointer-events-none">{icon}</span>}
                <select
                    id={id}
                    value={value}
                    onChange={e => onChange(e.target.value as T)}
                    aria-invalid={invalid || undefined}
                    className={`w-full appearance-none box-border text-base lg:text-[15px] text-brand-text cursor-pointer truncate
                        bg-brand-surface border rounded-[10px] lg:rounded-[8px]
                        ${icon ? 'pl-9' : 'pl-3.5'} pr-10 py-[15px] lg:py-[13px]
                        focus:outline-none focus:ring-[3px] transition-colors
                        ${invalid
                            ? 'border-brand-danger ring-[3px] ring-brand-danger-border focus:ring-brand-danger-border'
                            : 'border-brand-border-strong focus:border-brand-success focus:ring-brand-accent-soft'}`}
                >
                    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
            </div>
        </div>
    );
};
