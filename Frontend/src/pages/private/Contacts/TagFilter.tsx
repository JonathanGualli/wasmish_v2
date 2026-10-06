import { useState } from 'react';
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { ChevronDown, Tag as TagIcon } from 'lucide-react';
import { Checkbox } from '../../../components/Checkbox/Checkbox';
import { TagChip } from '../../../components/Tag/TagChip';
import type { Tag } from '../../../models/tag.model';
import { searchTags } from '../../../utils/tags';

/**
 * Filtrar Contactos por etiquetas, de selección múltiple: con varias marcadas
 * salen los que tienen alguna. Desde aquí se abre también «Gestionar etiquetas».
 */
export const TagFilter = ({ tags, value, onChange, onManage }: {
    tags: Tag[];
    value: string[];
    onChange: (tagIds: string[]) => void;
    onManage: () => void;
}) => {
    const [query, setQuery] = useState('');
    const chosen = tags.filter(tag => value.includes(tag.id));
    const visible = searchTags(tags, query);
    const active = chosen.length > 0;

    const toggle = (id: string) => onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);

    return (
        <Popover className="relative flex-none">
            <PopoverButton
                className={`flex items-center gap-[7px] h-9 md:h-[30px] pl-[11px] pr-2.5 rounded-[9px] md:rounded-lg border
                    text-[13px] md:text-[12.5px] font-semibold whitespace-nowrap cursor-pointer transition-colors
                    ${active
                        ? 'bg-brand-deep border-brand-deep text-white'
                        : 'bg-brand-surface border-brand-border-strong text-brand-strong hover:bg-brand-bg'}`}
            >
                <TagIcon size={14} />
                <span className="max-w-[160px] truncate">
                    {chosen.length === 1 ? chosen[0].name : active ? `Etiquetas · ${chosen.length}` : 'Etiquetas'}
                </span>
                <ChevronDown size={14} />
            </PopoverButton>

            <PopoverPanel
                anchor={{ to: 'bottom start', gap: 8, padding: 16 }}
                className="z-30 w-[300px] max-w-[calc(100vw-32px)] bg-brand-surface border border-brand-border rounded-xl
                    shadow-[0_18px_44px_rgba(14,17,22,0.16)] overflow-hidden"
            >
                {({ close }) => (
                    <>
                        {tags.length > 6 && (
                            <div className="p-2.5 border-b border-brand-raised">
                                <input
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    placeholder="Buscar etiqueta"
                                    autoFocus
                                    className="w-full box-border text-base md:text-[13px] text-brand-text bg-brand-bg border border-brand-border
                                        rounded-lg px-2.5 py-2 placeholder:text-brand-subtle focus:outline-none focus:bg-brand-surface
                                        focus:border-brand-success focus:ring-[3px] focus:ring-brand-accent-soft"
                                />
                            </div>
                        )}
                        <div className="py-1.5 max-h-[300px] overflow-y-auto">
                            {tags.length === 0 && (
                                <p className="px-3.5 py-2.5 text-[13px] leading-[1.5] text-brand-muted">
                                    Todavía no tienes etiquetas. Marca contactos en la lista y pulsa «Etiquetar».
                                </p>
                            )}
                            {tags.length > 0 && visible.length === 0 && (
                                <p className="px-3.5 py-2.5 text-[13px] text-brand-muted">Ninguna se llama así.</p>
                            )}
                            {visible.map(tag => (
                                <div
                                    key={tag.id}
                                    onClick={() => toggle(tag.id)}
                                    className="flex items-center gap-2.5 px-3.5 min-h-11 md:min-h-[38px] cursor-pointer hover:bg-brand-bg"
                                >
                                    <Checkbox checked={value.includes(tag.id)} onChange={() => toggle(tag.id)} label={tag.name} />
                                    <TagChip name={tag.name} />
                                    <span className="ml-auto font-mono text-xs text-brand-muted tabular-nums">
                                        {tag.contactCount.toLocaleString('es-EC')}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-brand-bg border-t border-brand-raised">
                            {tags.length > 1 && <span className="text-xs text-brand-muted">Muestra a quien tenga alguna.</span>}
                            <button
                                type="button"
                                onClick={() => { close(); onManage(); }}
                                className="ml-auto min-h-9 text-[12.5px] font-semibold text-brand-accent-strong cursor-pointer hover:underline"
                            >
                                Gestionar etiquetas
                            </button>
                        </div>
                    </>
                )}
            </PopoverPanel>
        </Popover>
    );
};
