import type { ReactNode } from "react";

interface SelectionBarProps {
    count: number;
    /** Aclaración junto al número: «2 excluidos». */
    note?: string;
    actionLabel: ReactNode;
    onAction: () => void;
    onClear: () => void;
}

/**
 * La barra de los contactos elegidos: flotando sobre la tabla en escritorio y
 * pegada abajo, a todo el ancho, en móvil. Es verde profundo (estructura) con
 * la única acción menta de la vista.
 */
export const SelectionBar = ({ count, note, actionLabel, onAction, onClear }: SelectionBarProps) => (
    <div className="fixed z-40 bottom-0 inset-x-0 md:bottom-6 md:inset-x-auto md:left-1/2 md:-translate-x-1/2
        flex items-center gap-2 md:gap-4 bg-brand-deep px-4 pt-3 pb-5 md:py-2.5 md:pl-5 md:pr-2.5
        md:rounded-[14px] shadow-[0_16px_40px_rgba(6,37,28,0.32)] whitespace-nowrap">
        <span className="hidden md:inline text-sm text-white">
            <span className="font-mono font-semibold tabular-nums">{count.toLocaleString('es-EC')}</span> seleccionados
            {note && <span className="text-[13px] text-brand-on-deep-muted"> · {note}</span>}
        </span>
        <span className="hidden md:block w-px h-6 bg-brand-deep-active" />
        <button
            type="button"
            onClick={onClear}
            className="h-11 md:h-10 px-3 rounded-[9px] text-sm font-semibold text-brand-on-deep cursor-pointer
                hover:bg-brand-deep-hover transition-colors"
        >
            Quitar selección
        </button>
        <button
            type="button"
            onClick={onAction}
            className="flex-1 md:flex-none h-12 md:h-10 px-4 rounded-[9px] bg-brand-accent text-brand-ink text-[15px] md:text-sm
                font-semibold cursor-pointer hover:bg-brand-accent-hover transition-colors
                flex items-center justify-center gap-2"
        >
            {actionLabel}
        </button>
    </div>
);
