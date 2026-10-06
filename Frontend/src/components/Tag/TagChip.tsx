import { X } from 'lucide-react';
import type { Tag } from '../../models/tag.model';

interface TagChipProps {
    name: string;
    /** Es una de las del filtro activo: se marca un poco más. */
    highlight?: boolean;
    /** Con una X para quitarla (el selector, la franja del filtro). */
    onRemove?: () => void;
    size?: 'sm' | 'md';
}

/**
 * Una etiqueta: un dato que puso quien usa Wasmish. Se ve como una etiqueta de
 * papel (esquina casi recta, borde gris, fondo blanco) para no confundirla con
 * las píldoras de estado, que son redondas y rellenas.
 */
export const TagChip = ({ name, highlight = false, onRemove, size = 'sm' }: TagChipProps) => (
    <span className={`inline-flex items-center gap-1 flex-none max-w-full rounded-[4px] border font-medium text-brand-strong whitespace-nowrap
        ${size === 'md' ? 'text-[12.5px] py-[3px]' : 'text-xs py-0.5'}
        ${onRemove ? 'pl-2 pr-1' : 'px-[7px]'}
        ${highlight ? 'bg-brand-bg border-brand-muted' : 'bg-brand-surface border-brand-border-strong'}`}>
        <span className="truncate">{name}</span>
        {onRemove && (
            <button
                type="button"
                onClick={event => { event.stopPropagation(); onRemove(); }}
                aria-label={`Quitar ${name}`}
                className="flex items-center justify-center w-4 h-4 rounded-[3px] text-brand-muted hover:text-brand-text
                    hover:bg-brand-raised transition-colors cursor-pointer"
            >
                <X size={12} strokeWidth={2.4} />
            </button>
        )}
    </span>
);

/** Las etiquetas de un contacto en una fila: las primeras y «+N». Sin ninguna, una raya. */
export const TagChips = ({ tags, max = 2, highlightIds = [], wrap = false }: {
    tags: Tag[];
    max?: number;
    highlightIds?: readonly string[];
    /** En la ficha y en móvil caben en varias líneas; en la tabla, en una. */
    wrap?: boolean;
}) => {
    if (tags.length === 0) return <span className="text-[13px] text-brand-border-strong">—</span>;
    // Las del filtro activo primero: son las que explican por qué sale en la lista.
    const ordered = [...tags].sort((a, b) => Number(highlightIds.includes(b.id)) - Number(highlightIds.includes(a.id)));
    const shown = ordered.slice(0, max);
    const hidden = ordered.length - shown.length;
    return (
        <span className={`flex items-center gap-[5px] min-w-0 ${wrap ? 'flex-wrap' : 'overflow-hidden'}`}>
            {shown.map(tag => <TagChip key={tag.id} name={tag.name} highlight={highlightIds.includes(tag.id)} />)}
            {hidden > 0 && (
                <span className="flex-none font-mono text-[11.5px] font-medium text-brand-muted" title={ordered.slice(max).map(t => t.name).join(', ')}>
                    +{hidden}
                </span>
            )}
        </span>
    );
};
