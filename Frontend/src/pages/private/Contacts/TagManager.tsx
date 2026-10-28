import { useState } from 'react';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { AlertCircle, ChevronLeft, Pencil, Tag as TagIcon, Trash2, Users, X } from 'lucide-react';
import { CustomButton } from '../../../components/Button/Button';
import { ConfirmDialog } from '../../../components/Dialog/ConfirmDialog';
import { TagChip } from '../../../components/Tag/TagChip';
import { useNotice } from '../../../components/Notice/context/useNotice';
import { tagError, useTagMutations, useTags } from '../../../hooks/useTags';
import type { Tag } from '../../../models/tag.model';
import { TAG_NAME_MAX, cleanTagName, findTagByName } from '../../../utils/tags';
import { SkeletonBox, SkeletonLine } from '../../../components/Skeleton/Skeleton';
import { SkeletonFrame } from '../../../components/Skeleton/SkeletonFrame';

const iconButton = `w-11 h-11 md:w-8 md:h-8 flex-none rounded-lg flex items-center justify-center text-brand-gray-600
    transition-colors cursor-pointer`;

/**
 * Las etiquetas de la cuenta: cuántos contactos tiene cada una, renombrarlas,
 * borrarlas e ir a ver sus contactos. Se crean al etiquetar, no aquí.
 */
export const TagManager = ({ open, onClose, onShowContacts }: {
    open: boolean;
    onClose: () => void;
    onShowContacts: (tag: Tag) => void;
}) => {
    const { data: tags, isLoading, isError } = useTags();
    const { visible: noticeVisible } = useNotice();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<Tag | null>(null);

    // El aviso global vive en otro portal: pulsar su X sería un «clic fuera».
    const handleClose = () => {
        if (noticeVisible || deleting) return;
        setEditingId(null);
        onClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} className="relative z-50">
            <DialogBackdrop className="fixed inset-0 bg-brand-ink/30" />
            <div className="fixed inset-0 flex justify-end">
                <DialogPanel className="w-full md:w-[480px] h-full bg-brand-surface flex flex-col
                    md:border-l md:border-brand-border md:shadow-[-24px_0_48px_rgba(14,17,22,0.10)]">
                    <div className="flex-none h-14 border-b border-brand-border px-4 md:pl-6 md:pr-5 flex items-center gap-1">
                        <button type="button" onClick={handleClose}
                            className="md:hidden -ml-2 h-11 pr-2 flex items-center gap-1 text-[15px] font-semibold text-brand-accent-strong cursor-pointer">
                            <ChevronLeft size={20} strokeWidth={2.2} />Contactos
                        </button>
                        <DialogTitle className="ml-1.5 md:ml-0 text-[17px] font-bold tracking-[-0.015em] text-brand-text">Etiquetas</DialogTitle>
                        <button type="button" onClick={handleClose} title="Cerrar"
                            className="hidden md:flex ml-auto w-8 h-8 rounded-lg items-center justify-center text-brand-muted
                                hover:bg-brand-bg hover:text-brand-text transition-colors cursor-pointer">
                            <X size={18} />
                        </button>
                    </div>

                    {isLoading && <TagListSkeleton />}
                    {isError && !tags && (
                        <div className="flex-1 flex items-center justify-center gap-2 p-8 text-sm text-brand-muted">
                            <AlertCircle size={16} />No se pudieron cargar las etiquetas.
                        </div>
                    )}
                    {!isLoading && tags && tags.length === 0 && <EmptyTags />}
                    {!isLoading && tags && tags.length > 0 && (
                        <div className="flex-1 overflow-y-auto">
                            <p className="px-4 md:px-6 pt-4 pb-3 text-[13px] leading-[1.55] text-brand-muted">
                                {TAG_INTRO}
                            </p>
                            <ul className="px-4 md:px-6 pb-6">
                                {tags.map(tag => (
                                    <li key={tag.id} className="border-b border-brand-raised">
                                        {editingId === tag.id ? (
                                            <RenameRow tag={tag} tags={tags} onDone={() => setEditingId(null)} />
                                        ) : (
                                            <div className="flex items-center gap-2 md:gap-3 min-h-14 py-1.5">
                                                <div className="min-w-0 flex flex-col md:flex-row md:items-center items-start gap-1 md:gap-3">
                                                    <TagChip name={tag.name} size="md" />
                                                    <span className="text-[13px] text-brand-muted whitespace-nowrap">
                                                        <span className="font-mono text-brand-strong tabular-nums">{tag.contactCount.toLocaleString('es-EC')}</span>
                                                        {tag.contactCount === 1 ? ' contacto' : ' contactos'}
                                                    </span>
                                                </div>
                                                <button type="button" onClick={() => onShowContacts(tag)} title="Ver contactos"
                                                    className={`ml-auto ${iconButton} md:w-auto md:px-2.5 text-brand-accent-strong hover:bg-brand-bg`}>
                                                    <Users size={17} className="md:hidden" />
                                                    <span className="hidden md:inline text-[13px] font-semibold">Ver contactos</span>
                                                </button>
                                                <button type="button" onClick={() => setEditingId(tag.id)} title="Renombrar"
                                                    className={`${iconButton} hover:bg-brand-bg`}>
                                                    <Pencil size={15} />
                                                </button>
                                                <button type="button" onClick={() => setDeleting(tag)} title="Borrar"
                                                    className={`${iconButton} hover:bg-brand-danger-soft hover:text-brand-danger`}>
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </DialogPanel>
            </div>

            <DeleteTagDialog tag={deleting} onClose={() => setDeleting(null)} />
        </Dialog>
    );
};

const TAG_INTRO = 'Se crean al etiquetar un contacto, desde la lista o su ficha. Aquí puedes renombrarlas o borrarlas.';
const CHIP_WIDTHS = ['72px', '96px', '64px', '110px', '84px'];

/** La lista mientras carga (diseño 3.7): las filas reales, con la etiqueta y su cuenta como bloques. */
const TagListSkeleton = () => (
    <SkeletonFrame label="Cargando etiquetas" className="flex-1 overflow-hidden">
        <p className="px-4 md:px-6 pt-4 pb-3 text-[13px] leading-[1.55] text-brand-muted">{TAG_INTRO}</p>
        <ul className="px-4 md:px-6 pb-6">
            {CHIP_WIDTHS.map(width => (
                <li key={width} className="border-b border-brand-raised flex items-center gap-3 min-h-14 py-1.5">
                    <SkeletonBox tone="soft" width={width} className="h-[26px] rounded-md" />
                    <SkeletonLine soft width="70px" />
                    <span className="ml-auto"><SkeletonBox className="w-24 h-8 rounded-lg" /></span>
                </li>
            ))}
        </ul>
    </SkeletonFrame>
);

const EmptyTags = () => (
    <div className="flex-1 flex items-center justify-center p-8">
        <div className="grid justify-items-center gap-2.5 text-center max-w-[340px]">
            <div className="w-[52px] h-[52px] rounded-[13px] bg-brand-bg text-brand-muted flex items-center justify-center">
                <TagIcon size={24} strokeWidth={1.8} />
            </div>
            <div className="text-[17px] font-bold text-brand-text">Todavía no tienes etiquetas</div>
            <div className="text-sm leading-[1.6] text-brand-strong">
                Agrupan contactos para encontrarlos y mandarles una campaña: por ejemplo, <TagChip name="VIP" /> para tus mejores clientes.
            </div>
            <div className="text-[13px] text-brand-muted">Marca contactos en la lista y pulsa «Etiquetar».</div>
        </div>
    </div>
);

/** Renombrar en la misma fila. Avisa del choque mientras se escribe, sin esperar al 409. */
const RenameRow = ({ tag, tags, onDone }: { tag: Tag; tags: Tag[]; onDone: () => void }) => {
    const [value, setValue] = useState(tag.name);
    const [serverError, setServerError] = useState<string | null>(null);
    const { rename } = useTagMutations();

    const name = cleanTagName(value);
    const clash = findTagByName(tags, name);
    const error = serverError
        ?? (!name ? 'Escribe el nombre de la etiqueta.'
        : name.length > TAG_NAME_MAX ? `Máximo ${TAG_NAME_MAX} caracteres.`
        : clash && clash.id !== tag.id ? `Ya hay una etiqueta «${clash.name}». Elige otro nombre.`
        : null);
    const canSave = !error && name !== tag.name && !rename.isPending;

    const save = async () => {
        if (!canSave) return;
        try {
            await rename.mutateAsync({ id: tag.id, name });
            onDone();
        } catch (err) {
            setServerError(tagError(err));
        }
    };

    return (
        <form onSubmit={e => { e.preventDefault(); save(); }} className="grid gap-2 py-3">
            <input
                value={value}
                onChange={e => { setValue(e.target.value); setServerError(null); }}
                onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onDone(); } }}
                autoFocus
                maxLength={TAG_NAME_MAX + 10}
                aria-invalid={Boolean(error) || undefined}
                className={`w-full box-border text-base md:text-[14.5px] text-brand-text bg-brand-surface border rounded-lg
                    px-3 py-[9px] focus:outline-none focus:ring-[3px] focus:ring-brand-accent-soft
                    ${error ? 'border-brand-danger' : 'border-brand-border-strong focus:border-brand-success'}`}
            />
            {error && name !== tag.name && (
                <span className="flex gap-1.5 text-[12.5px] leading-[1.45] text-brand-danger">
                    <AlertCircle size={14} className="flex-none mt-0.5" />{error}
                </span>
            )}
            <div className="flex items-center gap-2">
                <span className="flex-1 min-w-0 text-[12.5px] leading-[1.45] text-brand-muted">
                    El nombre cambia en {tag.contactCount === 1 ? 'su contacto' : <>sus <span className="font-mono">{tag.contactCount.toLocaleString('es-EC')}</span> contactos</>} a la vez.
                </span>
                <div className="h-10"><CustomButton variant="ghost" onClick={onDone}>Cancelar</CustomButton></div>
                <div className="h-10"><CustomButton type="submit" disabled={!canSave} isLoading={rename.isPending}>Guardar</CustomButton></div>
            </div>
        </form>
    );
};

const DeleteTagDialog = ({ tag, onClose }: { tag: Tag | null; onClose: () => void }) => {
    const { remove } = useTagMutations();
    const { notify } = useNotice();

    const handleDelete = async () => {
        if (!tag) return;
        try {
            await remove.mutateAsync(tag.id);
            onClose();
        } catch (err) {
            onClose();
            notify({ kind: 'error', text: tagError(err, 'No se pudo borrar la etiqueta. Inténtalo de nuevo.') });
        }
    };

    return (
        <ConfirmDialog
            open={Boolean(tag)}
            tone="danger"
            icon={<Trash2 size={19} />}
            title={`¿Borrar la etiqueta «${tag?.name ?? ''}»?`}
            description={tag && tag.contactCount > 0
                ? <>Se quitará de <b className="font-mono text-brand-text">{tag.contactCount.toLocaleString('es-EC')}</b> {tag.contactCount === 1 ? 'contacto' : 'contactos'}. Los contactos no se borran, y las campañas ya creadas no cambian.</>
                : 'Ningún contacto la tiene.'}
            confirmLabel="Borrar etiqueta"
            isLoading={remove.isPending}
            onConfirm={handleDelete}
            onCancel={onClose}
        />
    );
};
