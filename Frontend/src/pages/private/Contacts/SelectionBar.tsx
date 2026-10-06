import type { ReactNode } from "react";
import { X } from "lucide-react";

interface SelectionBarProps {
    count: number;
    /** Aclaración junto al número: «2 excluidos». */
    note?: string;
    /**
     * Qué hacer mientras no hay nadie elegido. Solo cuando la barra se ve sin
     * selección (al elegir los destinatarios de una campaña): la acción sale
     * deshabilitada y esto ocupa el sitio del número.
     */
    emptyHint?: string;
    actionLabel: ReactNode;
    onAction: () => void;
    onClear: () => void;
    /** Otra acción con los elegidos, antes de la principal («Etiquetar»). */
    extraAction?: ReactNode;
}

/**
 * La barra de los contactos elegidos: flotando sobre la tabla en escritorio y
 * pegada abajo, a todo el ancho, en móvil. Es verde profundo (estructura) con
 * la única acción menta de la vista.
 */
export const SelectionBar = ({ count, note, emptyHint, actionLabel, onAction, onClear, extraAction }: SelectionBarProps) => {
    const empty = count === 0;
    return (
        <div className="fixed z-40 bottom-0 inset-x-0 md:bottom-6 md:inset-x-auto md:left-1/2 md:-translate-x-1/2
            flex items-center gap-2 md:gap-4 bg-brand-deep px-4 pt-3 pb-5 md:py-2.5 md:pl-5 md:pr-2.5
            md:rounded-[14px] shadow-[0_16px_40px_rgba(6,37,28,0.32)] whitespace-nowrap">
            {empty ? (
                <span className="flex-1 md:flex-none min-w-0 whitespace-normal text-[13px] md:text-sm text-brand-on-deep">{emptyHint}</span>
            ) : (
                <>
                    <span className="hidden md:inline text-sm text-white">
                        <span className="font-mono font-semibold tabular-nums">{count.toLocaleString('es-EC')}</span> seleccionados
                        {note && <span className="text-[13px] text-brand-on-deep-muted"> · {note}</span>}
                    </span>
                    <span className="hidden md:block w-px h-6 bg-brand-deep-active" />
                    {/* En móvil, una X: con «Etiquetar» al lado, el texto no cabe junto a la acción principal. */}
                    <button
                        type="button"
                        onClick={onClear}
                        aria-label="Quitar selección"
                        className="flex-none flex items-center justify-center w-11 h-11 md:w-auto md:h-10 md:px-3 rounded-[9px]
                            text-sm font-semibold text-brand-on-deep cursor-pointer hover:bg-brand-deep-hover transition-colors"
                    >
                        <X size={20} className="md:hidden" />
                        <span className="hidden md:inline">Quitar selección</span>
                    </button>
                    {extraAction}
                </>
            )}
            <button
                type="button"
                onClick={onAction}
                disabled={empty}
                className={`md:flex-none h-12 md:h-10 px-4 rounded-[9px] text-[15px] md:text-sm font-semibold
                    flex items-center justify-center gap-2 transition-colors
                    ${empty
                        ? 'flex-none bg-brand-deep-active text-brand-on-deep-subtle cursor-not-allowed'
                        : 'flex-1 bg-brand-accent text-brand-ink cursor-pointer hover:bg-brand-accent-hover'}`}
            >
                {actionLabel}
            </button>
        </div>
    );
};
