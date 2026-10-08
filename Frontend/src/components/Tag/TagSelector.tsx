import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { useTags } from '../../hooks/useTags';
import {
    MAX_TAGS_PER_CONTACT, TAG_NAME_MAX, cleanTagName, findTagByName, searchTags, tagKey, tagsFromIds,
} from '../../utils/tags';
import { TagChip } from './TagChip';

/**
 * Lo elegido en un selector: las que ya existen (por id) y las nuevas, que se
 * crean al guardar (`useTagMutations().createMissing`).
 */
export interface TagSelection {
    ids: string[];
    newNames: string[];
}

type Option = { kind: 'tag'; id: string; name: string; count: number } | { kind: 'create'; name: string };

const MAX_OPTIONS = 8;

/**
 * Poner y quitar etiquetas escribiendo: busca entre las de la cuenta y, si no
 * hay ninguna con ese nombre, ofrece crearla. «vip » encuentra «VIP»: las
 * mayúsculas, las tildes y los espacios no cuentan, así no nace otra igual.
 * Sin `label` no lleva la línea de encima (ni el «3 de 20»): la ficha del chat
 * lo abre en el sitio de las etiquetas, que ya dicen qué es. `createsOnPick`:
 * quien lo usa guarda al momento (la ficha del chat), no al pulsar Guardar.
 */
export const TagSelector = ({ label, value, onChange, autoFocus = false, createsOnPick = false }: {
    label?: ReactNode;
    value: TagSelection;
    onChange: (value: TagSelection) => void;
    autoFocus?: boolean;
    createsOnPick?: boolean;
}) => {
    const { data: tags = [] } = useTags();
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listId = useId();

    const selected = tagsFromIds(tags, value.ids);
    const total = value.ids.length + value.newNames.length;
    const full = total >= MAX_TAGS_PER_CONTACT;

    const name = cleanTagName(query);
    const existing = findTagByName(tags, name);
    const isChosen = Boolean(name) && (
        (existing && value.ids.includes(existing.id)) || value.newNames.some(n => tagKey(n) === tagKey(name))
    );
    const canCreate = Boolean(name) && !existing && !isChosen && name.length <= TAG_NAME_MAX;

    const matches = searchTags(tags, name)
        .filter(tag => !value.ids.includes(tag.id))
        // La que se llama igual, primero: es la que se quería escribir.
        .sort((a, b) => Number(b.id === existing?.id) - Number(a.id === existing?.id))
        .slice(0, MAX_OPTIONS);
    const options: Option[] = [
        ...matches.map(tag => ({ kind: 'tag' as const, id: tag.id, name: tag.name, count: tag.contactCount })),
        ...(canCreate ? [{ kind: 'create' as const, name }] : []),
    ];

    const hint = full ? `Un contacto lleva como mucho ${MAX_TAGS_PER_CONTACT} etiquetas.`
        : isChosen ? 'Ya la tiene puesta.'
        : name.length > TAG_NAME_MAX ? `Una etiqueta tiene como mucho ${TAG_NAME_MAX} caracteres.`
        : existing && existing.name !== name ? 'Ya existe. Mayúsculas, tildes y espacios no cuentan: «vip» y «VIP» son la misma.'
        : canCreate ? `No hay ninguna con ese nombre. Se crea al ${createsOnPick ? 'elegirla' : 'guardar'}.`
        : '';

    const showList = open && !full && (options.length > 0 || Boolean(hint));
    const active = Math.min(activeIndex, Math.max(options.length - 1, 0));

    const choose = (option: Option) => {
        if (full) return;
        onChange(option.kind === 'tag'
            ? { ...value, ids: [...value.ids, option.id] }
            : { ...value, newNames: [...value.newNames, option.name] });
        setQuery('');
        setActiveIndex(0);
        inputRef.current?.focus();
    };

    const removeId = (id: string) => onChange({ ...value, ids: value.ids.filter(i => i !== id) });
    const removeNew = (newName: string) => onChange({ ...value, newNames: value.newNames.filter(n => n !== newName) });

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setActiveIndex(i => (options.length ? (Math.min(i, options.length - 1) + step + options.length) % options.length : 0));
        } else if (event.key === 'Enter') {
            // Dentro de un formulario: Enter elige, no guarda.
            event.preventDefault();
            if (showList && options[active]) choose(options[active]);
        } else if (event.key === 'Escape' && open) {
            // Que no cierre también el panel donde está el formulario.
            event.stopPropagation();
            setOpen(false);
        } else if (event.key === 'Backspace' && !query) {
            if (value.newNames.length) removeNew(value.newNames[value.newNames.length - 1]);
            else if (value.ids.length) removeId(value.ids[value.ids.length - 1]);
        }
    };

    return (
        <div className="relative grid gap-[7px]">
            {label && (
                <span className="flex items-baseline text-[13px] font-semibold text-brand-strong">
                    {label}
                    <span className="ml-auto font-mono text-[11px] font-normal text-brand-subtle tabular-nums">
                        {total} de {MAX_TAGS_PER_CONTACT}
                    </span>
                </span>
            )}
            <div
                onClick={() => inputRef.current?.focus()}
                className="flex flex-wrap items-center gap-1.5 min-h-[50px] lg:min-h-[46px] box-border px-2.5 py-2 cursor-text
                    bg-brand-surface border border-brand-border-strong rounded-[10px] lg:rounded-[8px] transition-colors
                    focus-within:border-brand-success focus-within:ring-[3px] focus-within:ring-brand-accent-soft"
            >
                {selected.map(tag => <TagChip key={tag.id} name={tag.name} size="md" onRemove={() => removeId(tag.id)} />)}
                {value.newNames.map(newName => <TagChip key={newName} name={newName} size="md" onRemove={() => removeNew(newName)} />)}
                <input
                    ref={inputRef}
                    value={query}
                    onChange={e => { setQuery(e.target.value); setActiveIndex(0); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setOpen(false)}
                    onKeyDown={handleKeyDown}
                    autoFocus={autoFocus}
                    disabled={full}
                    placeholder={total === 0 ? 'Escribe para buscar o crear: VIP, Quito…' : ''}
                    maxLength={TAG_NAME_MAX + 10}
                    role="combobox"
                    aria-expanded={showList}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    className="flex-1 min-w-[120px] bg-transparent text-base lg:text-[14.5px] text-brand-text
                        placeholder:text-brand-subtle focus:outline-none disabled:cursor-not-allowed"
                />
            </div>

            {showList && (
                <div
                    id={listId}
                    role="listbox"
                    // Que el clic no le quite el foco al campo antes de elegir.
                    onMouseDown={event => event.preventDefault()}
                    className="absolute z-10 top-full left-0 right-0 mt-1.5 bg-brand-surface border border-brand-border
                        rounded-xl shadow-[0_18px_44px_rgba(14,17,22,0.16)] overflow-hidden"
                >
                    {options.map((option, i) => (
                        <button
                            key={option.kind === 'tag' ? option.id : 'create'}
                            type="button"
                            role="option"
                            aria-selected={i === active}
                            onClick={() => choose(option)}
                            onMouseEnter={() => setActiveIndex(i)}
                            className={`w-full flex items-center gap-2.5 px-3.5 min-h-11 text-left cursor-pointer
                                ${option.kind === 'create' ? 'border-t border-brand-raised first:border-t-0' : ''}
                                ${i === active ? 'bg-brand-bg' : ''}`}
                        >
                            {option.kind === 'tag' ? (
                                <>
                                    <TagChip name={option.name} />
                                    <span className="ml-auto text-xs text-brand-muted">
                                        {option.count === 1 ? '1 contacto' : `${option.count.toLocaleString('es-EC')} contactos`}
                                    </span>
                                </>
                            ) : (
                                <span className="flex items-center gap-2.5 min-w-0 text-[13.5px] font-semibold text-brand-accent-strong">
                                    <Plus size={15} strokeWidth={2.4} className="flex-none" />
                                    <span className="truncate">Crear «{option.name}»</span>
                                </span>
                            )}
                        </button>
                    ))}
                    {hint && (
                        <div className={`px-3.5 py-2.5 bg-brand-bg text-xs leading-[1.5] text-brand-gray-600
                            ${options.length ? 'border-t border-brand-raised' : ''}`}>
                            {hint}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
