import type { MouseEvent } from 'react';
import { Check, Minus } from 'lucide-react';

interface CheckboxProps {
    checked: boolean;
    /** Parte marcada: la cabecera de una tabla con algunas filas elegidas. */
    indeterminate?: boolean;
    onChange: () => void;
    label: string;
    /** Área de toque de 44px, para móvil. La casilla se ve igual. */
    touch?: boolean;
}

/**
 * Casilla de selección. Es un botón con `role="checkbox"` en vez de un
 * `<input>` para poder pintar el estado parcial igual en todos los navegadores.
 * Para el clic: la fila que la contiene suele abrir algo, y marcar no debe.
 */
export const Checkbox = ({ checked, indeterminate = false, onChange, label, touch = false }: CheckboxProps) => {
    const active = checked || indeterminate;

    const handleClick = (event: MouseEvent) => {
        event.stopPropagation();
        onChange();
    };

    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={indeterminate ? 'mixed' : checked}
            aria-label={label}
            onClick={handleClick}
            className={`flex-none flex items-center justify-center cursor-pointer
                ${touch ? 'w-11 h-11 -m-2.5' : 'w-[18px] h-[18px]'}`}
        >
            <span className={`flex items-center justify-center box-border transition-colors
                ${touch ? 'w-[22px] h-[22px] rounded-[6px]' : 'w-[18px] h-[18px] rounded-[5px]'}
                ${active ? 'bg-brand-deep border-brand-deep' : 'bg-brand-surface border-brand-border-strong'}
                border-[1.5px]`}>
                {indeterminate
                    ? <Minus size={12} strokeWidth={3.5} className="text-brand-accent" />
                    : checked && <Check size={12} strokeWidth={3.5} className="text-brand-accent" />}
            </span>
        </button>
    );
};
