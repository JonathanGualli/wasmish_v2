import type { ReactNode } from "react";
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { Pencil, Trash2 } from "lucide-react";
import { formatNoteDate, noteOwnerLabel, type NoteView } from "../../../utils/contactNotes";

/** Una hoja desde abajo, como las del teléfono en Chats. */
const Sheet = ({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) => (
    <Dialog open={open} onClose={onClose} className="relative z-[60] md:hidden">
        <DialogBackdrop className="fixed inset-0 bg-brand-ink/50" />
        <div className="fixed inset-0 flex items-end">
            <DialogPanel className="w-full rounded-t-2xl bg-brand-surface px-[18px] pt-2.5 pb-[max(18px,env(safe-area-inset-bottom))]">
                <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-brand-border-strong" />
                {children}
            </DialogPanel>
        </div>
    </Dialog>
);

/** De quién es y cuándo, arriba de la hoja: «Tu nota · hace 5 min». */
const sheetHeading = (note: NoteView, mine: boolean) => {
    if (note.source === 'legacy') return 'Nota de antes';
    const who = mine ? 'Tu nota' : `Nota de ${note.author?.name ?? 'otra persona'}`;
    return `${who} · ${formatNoteDate(note.createdAt)}`;
};

/** «⋯» de una nota en el teléfono (diseño M3): recuerda qué nota es y ofrece Editar y Borrar. */
export const NoteActionsSheet = ({ note, mine, onEdit, onDelete, onClose }: {
    note: NoteView | null; mine: boolean; onEdit: () => void; onDelete: () => void; onClose: () => void;
}) => (
    <Sheet open={Boolean(note)} onClose={onClose}>
        {note && (
            <>
                <DialogTitle className="text-[13px] font-semibold text-brand-text">{sheetHeading(note, mine)}</DialogTitle>
                <p className="mt-0.5 text-[13px] leading-[1.45] text-brand-muted line-clamp-2 [overflow-wrap:anywhere]">{note.text}</p>
                <div className="mt-3 border-t border-brand-border grid">
                    <button type="button" onClick={onEdit}
                        className="h-[52px] flex items-center gap-3 text-[16px] font-medium text-brand-text cursor-pointer">
                        <Pencil size={19} />Editar nota
                    </button>
                    <button type="button" onClick={onDelete}
                        className="h-[52px] flex items-center gap-3 text-[16px] font-medium text-brand-danger cursor-pointer">
                        <Trash2 size={19} />Borrar nota
                    </button>
                </div>
                <button type="button" onClick={onClose}
                    className="mt-2 w-full h-12 rounded-[10px] bg-brand-bg text-[15px] font-semibold text-brand-strong cursor-pointer">
                    Cancelar
                </button>
            </>
        )}
    </Sheet>
);

/** Confirmar el borrado en el teléfono (diseño M4): de quién es, y su texto. */
export const NoteDeleteSheet = ({ note, mine, onConfirm, onClose }: {
    note: NoteView | null; mine: boolean; onConfirm: () => void; onClose: () => void;
}) => (
    <Sheet open={Boolean(note)} onClose={onClose}>
        {note && (
            <>
                <DialogTitle className="text-[19px] font-bold tracking-[-0.015em] text-brand-text">
                    ¿Borrar {noteOwnerLabel(note, mine)}?
                </DialogTitle>
                <p className="mt-2 text-[14px] leading-[1.5] text-brand-strong [overflow-wrap:anywhere]">
                    <span className="line-clamp-3">«{note.text}»</span> No se puede deshacer.
                </p>
                <button type="button" onClick={onConfirm}
                    className="mt-4 w-full h-12 rounded-[10px] bg-brand-danger text-[15px] font-semibold text-white cursor-pointer">
                    Borrar nota
                </button>
                <button type="button" onClick={onClose}
                    className="mt-1 w-full h-11 text-[15px] font-semibold text-brand-strong cursor-pointer">
                    Cancelar
                </button>
            </>
        )}
    </Sheet>
);
