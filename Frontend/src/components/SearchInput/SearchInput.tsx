import type { InputHTMLAttributes } from "react";
import { Search } from "lucide-react";

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
    value: string;
    onChange: (value: string) => void;
    /** Clases del contenedor (ancho, márgenes). */
    className?: string;
};

/** Caja de búsqueda con la lupa: la de la bandeja, Contactos y los destinatarios de un envío. */
export const SearchInput = ({ value, onChange, className = '', ...props }: SearchInputProps) => (
    <div className={`relative flex items-center ${className}`}>
        <Search size={16} className="absolute left-[11px] text-brand-subtle pointer-events-none" />
        <input
            type="search"
            {...props}
            value={value}
            onChange={e => onChange(e.target.value)}
            className="w-full box-border text-[13px] text-brand-text bg-brand-bg
                border border-brand-border rounded-lg py-2.5 pl-[34px] pr-3
                placeholder:text-brand-subtle
                focus:outline-none focus:bg-brand-surface focus:border-brand-success
                focus:ring-[3px] focus:ring-brand-accent-soft transition-colors"
        />
    </div>
);
