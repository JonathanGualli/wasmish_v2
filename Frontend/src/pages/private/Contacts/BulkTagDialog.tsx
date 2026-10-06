import { useState, type ReactNode } from 'react';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { Check, LoaderCircle, Plus } from 'lucide-react';
import { Checkbox } from '../../../components/Checkbox/Checkbox';
import { CustomButton } from '../../../components/Button/Button';
import { TagChip } from '../../../components/Tag/TagChip';
import { useNoticeContext } from '../../../components/Notice/context/UseNoticeContext';
import { tagError, useTagMutations, useTagSelectionSummary, useTags } from '../../../hooks/useTags';
import type { CampaignRecipientsInput } from '../../../models/campaign.model';
import type { BulkTagResult } from '../../../models/tag.model';
import { pluralize } from '../../../utils/campaignDisplay';
import { MAX_TAGS_PER_CONTACT, TAG_NAME_MAX, cleanTagName, findTagByName, searchTags, tagKey } from '../../../utils/tags';

type Mode = 'add' | 'remove';

interface Props {
    selection: CampaignRecipientsInput;
    /** Cuántos hay elegidos, mientras llegan los números del backend. */
    count: number;
    /** «todos los que coinciden»: se etiquetan también los de otras páginas, y hay que decirlo. */
    allMatching: boolean;
    /** A quiénes, en palabras: «que coinciden con «ferretería»». */
    scope: string;
    onClose: () => void;
    /** Terminó bien: se quita la selección. */
    onDone: () => void;
}

const fmt = (n: number) => n.toLocaleString('es-EC');

/** El aviso de cómo quedó, con los que no se pudieron etiquetar si los hubo. */
const resultMessage = (mode: Mode, names: string[], result: BulkTagResult): ReactNode => {
    const one = names.length === 1;
    const what = one ? <b className="font-semibold">{names[0]}</b> : `${names.length} etiquetas`;
    const changed = mode === 'add' ? result.matched - result.overLimit : result.modified;
    const people = <><b className="font-mono font-semibold">{fmt(changed)}</b> {changed === 1 ? 'contacto' : 'contactos'}</>;
    return (
        <div className="flex items-start gap-2.5 text-sm text-brand-text">
            <span className="flex-none mt-px w-[22px] h-[22px] rounded-full bg-brand-accent-soft text-brand-accent-strong flex items-center justify-center">
                <Check size={13} strokeWidth={3} />
            </span>
            <span className="grid gap-1">
                <span>
                    {mode === 'add'
                        ? <>{one ? 'Se añadió' : 'Se añadieron'} {what} a {people}</>
                        : <>{one ? 'Se quitó' : 'Se quitaron'} {what} de {people}</>}
                </span>
                {result.overLimit > 0 && (
                    <span className="text-[13px] text-brand-warning">
                        {pluralize(result.overLimit, 'no se etiquetó', 'no se etiquetaron')}: tendría{result.overLimit === 1 ? '' : 'n'} más
                        de {MAX_TAGS_PER_CONTACT} etiquetas.
                    </span>
                )}
            </span>
        </div>
    );
};

/**
 * «Etiquetar» desde la barra de selección: añadir o quitar etiquetas a los
 * elegidos, que con «todos los que coinciden» pueden ser miles. Antes de
 * confirmar dice a cuántos toca, y cuántos ya tienen cada etiqueta. En
 * escritorio flota sobre la barra; en móvil es una hoja que sube desde abajo.
 */
export const BulkTagDialog = ({ selection, count, allMatching, scope, onClose, onDone }: Props) => {
    const { data: tags = [] } = useTags();
    const summary = useTagSelectionSummary(selection, true);
    const { bulk, create, createMissing } = useTagMutations();
    const { state: noticeVisible, setState, setContent } = useNoticeContext();

    const [mode, setMode] = useState<Mode>('add');
    const [query, setQuery] = useState('');
    const [chosen, setChosen] = useState<string[]>([]);
    const [newNames, setNewNames] = useState<string[]>([]);

    const total = summary.data?.total ?? count;
    const countOf = (id: string) => summary.data?.tags.find(t => t.id === id)?.count ?? 0;
    const isPending = bulk.isPending || create.isPending;

    const changeMode = (next: Mode) => {
        setMode(next);
        setChosen([]);
        setNewNames([]);
        setQuery('');
    };
    const toggle = (id: string) => setChosen(c => (c.includes(id) ? c.filter(v => v !== id) : [...c, id]));

    // Para quitar solo sirven las que tiene alguno de los elegidos.
    const pool = mode === 'add' ? tags : tags.filter(tag => countOf(tag.id) > 0);
    const visible = searchTags(pool, query);
    const name = cleanTagName(query);
    const canCreate = mode === 'add' && Boolean(name) && name.length <= TAG_NAME_MAX
        && !findTagByName(tags, name) && !newNames.some(n => tagKey(n) === tagKey(name));

    const createNew = () => {
        setNewNames(n => [...n, name]);
        setQuery('');
    };

    const chosenTags = tags.filter(tag => chosen.includes(tag.id));
    const names = [...chosenTags.map(tag => tag.name), ...newNames];

    const rightLabel = (id: string) => {
        const have = countOf(id);
        if (!summary.data) return '';
        if (mode === 'remove') return `${fmt(have)} de ${fmt(total)}`;
        if (have === 0) return '';
        return have === total ? 'Ya la tienen todos' : `${fmt(have)} ya la tienen`;
    };

    const note = () => {
        if (mode === 'remove') {
            return `Solo las que tiene alguno de los ${fmt(total)}. Se quita a quien la tenga; los contactos no se borran.`;
        }
        const base = allMatching
            ? `Se añade a los ${fmt(total)} ${scope}, no solo a los de esta página.`
            : total === 1 ? 'Se añade al contacto marcado.' : `Se añade a los ${fmt(total)} contactos marcados.`;
        if (chosen.length !== 1 || newNames.length) return base;
        const have = countOf(chosen[0]);
        if (have === 0) return base;
        if (have === total) return `${base} Ya la tienen todos: no cambiará nada.`;
        return have === 1 ? `${base} El que ya la tiene no cambia.` : `${base} Los ${fmt(have)} que ya la tienen no cambian.`;
    };

    const buttonLabel = () => {
        if (names.length === 0) return 'Elige una etiqueta';
        if (mode === 'add') {
            const what = names.length === 1 ? names[0] : `${names.length} etiquetas`;
            return `Añadir ${what} a ${pluralize(total, 'contacto', 'contactos')}`;
        }
        return names.length === 1
            ? `Quitar ${names[0]} de ${pluralize(countOf(chosen[0]), 'contacto', 'contactos')}`
            : `Quitar ${names.length} etiquetas`;
    };

    const confirm = async () => {
        if (names.length === 0 || isPending) return;
        try {
            const created = await createMissing(newNames);
            const ids = [...chosen, ...created.map(tag => tag.id)];
            const result = await bulk.mutateAsync({
                selection,
                add: mode === 'add' ? ids : [],
                remove: mode === 'remove' ? ids : [],
            });
            setContent(resultMessage(mode, names, result));
            setState(true);
            onDone();
        } catch (err) {
            setContent(<div className="text-brand-danger text-sm"><p>{tagError(err, 'No se pudieron guardar las etiquetas. Inténtalo de nuevo.')}</p></div>);
            setState(true);
        }
    };

    // El aviso global vive en otro portal: pulsar su X sería un «clic fuera».
    const handleClose = () => {
        if (!noticeVisible && !isPending) onClose();
    };

    const segment = (value: Mode, label: string) => (
        <button
            type="button"
            onClick={() => changeMode(value)}
            aria-pressed={mode === value}
            className={`h-[38px] md:h-8 rounded-[8px] md:rounded-[7px] text-sm md:text-[13px] font-semibold cursor-pointer transition-colors
                ${mode === value ? 'bg-brand-surface text-brand-text shadow-[0_1px_2px_rgba(14,17,22,0.12)]' : 'text-brand-gray-600 hover:text-brand-text'}`}
        >
            {label}
        </button>
    );

    return (
        <Dialog open onClose={handleClose} className="relative z-50">
            <DialogBackdrop className="fixed inset-0 bg-brand-ink/40 md:bg-transparent" />
            <DialogPanel
                className="fixed inset-x-0 bottom-0 max-h-[85vh] flex flex-col bg-brand-surface rounded-t-[20px] pt-2
                    md:pt-0 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:bottom-[92px] md:w-[360px] md:max-h-[min(560px,calc(100vh-140px))]
                    md:rounded-[14px] md:border md:border-brand-border md:shadow-[0_22px_54px_rgba(14,17,22,0.22)] overflow-hidden"
            >
                <div className="md:hidden justify-self-center mx-auto w-9 h-1 rounded-full bg-brand-border-strong mb-2" />
                <div className="flex-none px-4 md:px-3 md:pt-3 pb-2.5 grid gap-2.5 border-b border-brand-raised">
                    <div className="flex items-baseline gap-2 md:sr-only">
                        <DialogTitle className="text-[17px] font-bold text-brand-text">Etiquetar</DialogTitle>
                        <span className="text-[13px] text-brand-muted">{pluralize(total, 'contacto', 'contactos')}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-[3px] p-[3px] bg-brand-bg rounded-[10px] md:rounded-[9px]">
                        {segment('add', 'Añadir')}
                        {segment('remove', 'Quitar')}
                    </div>
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => {
                            if (e.key !== 'Enter') return;
                            e.preventDefault();
                            if (canCreate && visible.length === 0) createNew();
                            else if (visible.length === 1) toggle(visible[0].id);
                        }}
                        placeholder={mode === 'add' ? 'Buscar o crear etiqueta' : 'Buscar etiqueta'}
                        maxLength={TAG_NAME_MAX + 10}
                        className="w-full box-border text-base md:text-[13.5px] text-brand-text bg-brand-surface border border-brand-border-strong
                            rounded-[9px] md:rounded-lg px-3 md:px-[11px] py-3 md:py-[9px] placeholder:text-brand-subtle focus:outline-none
                            focus:border-brand-success focus:ring-[3px] focus:ring-brand-accent-soft"
                    />
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto py-1.5">
                    {mode === 'remove' && summary.isLoading && (
                        <p className="px-4 md:px-3.5 py-2.5 flex items-center gap-2 text-[13px] text-brand-muted">
                            <LoaderCircle size={14} className="animate-spin" />Buscando sus etiquetas…
                        </p>
                    )}
                    {mode === 'remove' && summary.data && pool.length === 0 && (
                        <p className="px-4 md:px-3.5 py-2.5 text-[13px] text-brand-muted">
                            {total === 1 ? 'No tiene etiquetas.' : `Ninguno de los ${fmt(total)} tiene etiquetas.`}
                        </p>
                    )}
                    {mode === 'add' && tags.length === 0 && newNames.length === 0 && !name && (
                        <p className="px-4 md:px-3.5 py-2.5 text-[13px] leading-[1.5] text-brand-muted">
                            Escribe el nombre de la primera: VIP, Quito, Feria octubre…
                        </p>
                    )}
                    {visible.map(tag => (
                        <div key={tag.id} onClick={() => toggle(tag.id)}
                            className="flex items-center gap-3 md:gap-2.5 px-4 md:px-3.5 min-h-12 md:min-h-[38px] cursor-pointer hover:bg-brand-bg">
                            <Checkbox checked={chosen.includes(tag.id)} onChange={() => toggle(tag.id)} label={tag.name} />
                            <TagChip name={tag.name} />
                            <span className="ml-auto text-[12.5px] md:text-xs text-brand-muted whitespace-nowrap">{rightLabel(tag.id)}</span>
                        </div>
                    ))}
                    {newNames.map(newName => (
                        <div key={newName} onClick={() => setNewNames(n => n.filter(v => v !== newName))}
                            className="flex items-center gap-3 md:gap-2.5 px-4 md:px-3.5 min-h-12 md:min-h-[38px] cursor-pointer hover:bg-brand-bg">
                            <Checkbox checked onChange={() => setNewNames(n => n.filter(v => v !== newName))} label={newName} />
                            <TagChip name={newName} />
                            <span className="ml-auto text-xs text-brand-muted">Nueva</span>
                        </div>
                    ))}
                    {canCreate && (
                        <button type="button" onClick={createNew}
                            className="w-full flex items-center gap-2.5 px-4 md:px-3.5 min-h-12 md:min-h-[38px] text-left text-[13.5px]
                                font-semibold text-brand-accent-strong cursor-pointer hover:bg-brand-bg">
                            <Plus size={15} strokeWidth={2.4} className="flex-none" />
                            <span className="truncate">Crear «{name}»</span>
                        </button>
                    )}
                </div>

                <div className="flex-none px-4 md:px-3.5 pt-3 pb-5 md:pb-3 border-t border-brand-raised bg-brand-bg grid gap-2.5">
                    <span className="text-[12.5px] leading-[1.5] text-brand-gray-600">{note()}</span>
                    <div className="h-12 md:h-[42px]">
                        <CustomButton
                            variant={mode === 'add' ? 'primary' : 'secondary'}
                            onClick={confirm}
                            disabled={names.length === 0 || (mode === 'remove' && !summary.data)}
                            isLoading={isPending}
                        >
                            <span className="truncate">{buttonLabel()}</span>
                        </CustomButton>
                    </div>
                </div>
            </DialogPanel>
        </Dialog>
    );
};
