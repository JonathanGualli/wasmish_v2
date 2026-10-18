import { useState, type ReactNode } from "react";
import { CircleAlert, FileText, History, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { initials } from "../../../utils/initials";
import {
    NOTE_PREVIEW_CHARS, formatNoteDate, formatNoteFullDate, noteOwnerLabel, type NoteView,
} from "../../../utils/contactNotes";

interface Props {
    note: NoteView;
    /** La escribió quien mira: su avatar va en menta. */
    mine: boolean;
    /** Recién guardada, aún sin respuesta (D05). */
    saving?: boolean;
    /** No se guardó (D10) o no se borró (D12): el motivo, y qué hacer. */
    failure?: { title: string; message: string; onRetry: () => void; onDiscard?: () => void } | null;
    /** Llegó de otra persona mientras se miraba (D13). */
    fresh?: boolean;
    /** En su lugar, el campo para editarla (D08). */
    editor?: ReactNode;
    /** Confirmar el borrado dentro de la nota (D09, en la computadora). */
    confirmDelete?: { onConfirm: () => void; onCancel: () => void } | null;
    onEdit?: () => void;
    onDelete?: () => void;
    /** En el teléfono, «⋯» abre la hoja con Editar y Borrar (M3). */
    onOpenActions?: () => void;
}

/**
 * Una nota (diseño `Wasmish Notas del contacto`): quién y cuándo arriba, el
 * texto debajo. La de antes no tiene autor ni fecha y lo dice; la importada
 * lleva su marca; quien ya no está, el avatar apagado. Editar y Borrar solo
 * aparecen si se puede (`canEdit`): al pasar el ratón en la computadora, con
 * «⋯» en el teléfono.
 */
export const NoteItem = ({
    note, mine, saving = false, failure = null, fresh = false, editor = null, confirmDelete = null,
    onEdit, onDelete, onOpenActions,
}: Props) => {
    const [expanded, setExpanded] = useState(false);
    const legacy = note.source === 'legacy';
    const gone = note.author?.active === false;
    const long = note.text.length > NOTE_PREVIEW_CHARS;
    const actionable = note.canEdit && !saving && !failure && !editor && !confirmDelete;

    const box = failure || confirmDelete
        ? 'bg-brand-danger-soft border-brand-danger-border'
        : fresh
            ? 'bg-brand-green-50 border-brand-green-100'
            : 'border-transparent hover:bg-brand-bg';

    return (
        <li className={`group relative -mx-2 px-2 py-2 rounded-[10px] border transition-colors ${box}`}>
            <div className="flex items-center gap-1.5 min-h-7 pr-16 max-md:pr-9 text-[12px] text-brand-subtle">
                {legacy ? (
                    <>
                        <span className="w-5 h-5 flex-none rounded-[6px] border border-dashed border-brand-border-strong
                            flex items-center justify-center text-brand-muted">
                            <History size={12} />
                        </span>
                        <span className="text-[13px] font-semibold text-brand-text">Nota de antes</span>
                    </>
                ) : (
                    <>
                        <span className={`w-5 h-5 flex-none rounded-[6px] flex items-center justify-center text-[8.5px] font-bold
                            ${mine ? 'bg-brand-accent-soft text-brand-accent-strong' : 'bg-brand-raised text-brand-muted'}
                            ${gone ? 'opacity-60' : ''}`}>
                            {initials(note.author?.name ?? '')}
                        </span>
                        <span className={`text-[13px] font-semibold truncate ${gone ? 'text-brand-muted' : 'text-brand-text'}`}>
                            {note.author?.name}
                        </span>
                        {gone && <span className="flex-none" title="Ya no está en la cuenta">· ya no está</span>}
                        <span className="flex-none" title={saving ? undefined : formatNoteFullDate(note.createdAt)}>
                            · {saving ? 'Guardando…' : formatNoteDate(note.createdAt)}
                        </span>
                        {note.editedAt && (
                            <span className="flex-none"
                                title={`Editada${note.editedBy ? ` por ${note.editedBy.name}` : ''} · ${formatNoteFullDate(note.editedAt)}`}>
                                · editada
                            </span>
                        )}
                        {note.source === 'import' && (
                            <span title="Importada desde un archivo"
                                className="flex-none inline-flex items-center gap-1 ml-0.5 rounded-[5px] bg-brand-raised px-1.5 py-px
                                    text-[11px] font-semibold text-brand-muted">
                                <FileText size={11} />Importada
                            </span>
                        )}
                        {fresh && (
                            <span className="flex-none ml-0.5 rounded-[5px] bg-brand-accent-soft px-1.5 py-px text-[11px] font-bold text-brand-accent-strong">
                                Nueva
                            </span>
                        )}
                    </>
                )}
            </div>

            {actionable && (onEdit || onDelete) && (
                <div className="absolute top-1.5 right-2 hidden md:flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <IconAction label="Editar la nota" onClick={onEdit}><Pencil size={14} /></IconAction>
                    <IconAction label="Borrar la nota" onClick={onDelete} danger><Trash2 size={14} /></IconAction>
                </div>
            )}
            {actionable && onOpenActions && (
                <button type="button" onClick={onOpenActions} aria-label="Acciones de la nota"
                    className="md:hidden absolute top-1 right-1 w-9 h-9 rounded-[8px] flex items-center justify-center
                        text-brand-muted active:bg-brand-raised cursor-pointer">
                    <MoreHorizontal size={18} />
                </button>
            )}

            {editor ? (
                <div className="mt-1.5">{editor}</div>
            ) : (
                <p className="mt-1 text-sm leading-[1.55] text-brand-strong whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {long && !expanded ? `${note.text.slice(0, NOTE_PREVIEW_CHARS).trimEnd()}… ` : note.text}
                    {long && !expanded && (
                        <button type="button" onClick={() => setExpanded(true)}
                            className="font-semibold text-brand-accent-strong hover:underline cursor-pointer">
                            Ver más
                        </button>
                    )}
                </p>
            )}
            {legacy && !editor && (
                <p className="mt-1 text-[12px] leading-[1.45] text-brand-subtle">Escrita antes de que las notas llevaran nombre y fecha.</p>
            )}

            {failure && (
                <p className="mt-1.5 flex gap-2 text-[12.5px] leading-[1.5] text-brand-strong">
                    <CircleAlert size={15} className="flex-none mt-0.5 text-brand-danger" />
                    <span>
                        <span className="font-semibold text-brand-danger">{failure.title}</span> {failure.message}{' '}
                        <button type="button" onClick={failure.onRetry}
                            className="font-semibold text-brand-accent-strong underline cursor-pointer">
                            Reintentar
                        </button>
                        {failure.onDiscard && (
                            <>
                                {' · '}
                                <button type="button" onClick={failure.onDiscard}
                                    className="font-semibold text-brand-muted underline cursor-pointer">
                                    Descartar
                                </button>
                            </>
                        )}
                    </span>
                </p>
            )}

            {confirmDelete && (
                <div className="mt-2.5 pt-2.5 border-t border-brand-danger-border grid gap-2.5">
                    <p className="text-[13px] leading-[1.5] text-brand-strong">
                        <span className="font-semibold text-brand-text">¿Borrar {noteOwnerLabel(note, mine)}?</span> No se puede deshacer.
                    </p>
                    <div className="flex justify-end gap-1.5">
                        <button type="button" onClick={confirmDelete.onCancel}
                            className="h-8 px-3 rounded-[8px] border border-brand-border-strong bg-brand-surface text-[13px] font-semibold
                                text-brand-strong hover:bg-brand-bg transition-colors cursor-pointer">
                            Cancelar
                        </button>
                        <button type="button" onClick={confirmDelete.onConfirm}
                            className="h-8 px-3.5 rounded-[8px] bg-brand-danger text-[13px] font-semibold text-white
                                hover:brightness-110 transition cursor-pointer">
                            Borrar nota
                        </button>
                    </div>
                </div>
            )}
        </li>
    );
};

const IconAction = ({ label, onClick, danger = false, children }: {
    label: string; onClick?: () => void; danger?: boolean; children: ReactNode;
}) => (
    <button type="button" onClick={onClick} title={label} aria-label={label}
        className={`w-7 h-7 rounded-[7px] border border-brand-border bg-brand-surface flex items-center justify-center
            hover:bg-brand-bg transition-colors cursor-pointer ${danger ? 'text-brand-danger' : 'text-brand-strong'}`}>
        {children}
    </button>
);
