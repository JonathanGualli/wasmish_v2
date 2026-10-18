import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Pencil, Plus } from "lucide-react";
import { useAuthContext } from "../../../context/auth.context";
import { useContactNoteMutations } from "../../../hooks/useContactNotes";
import type { ContactDetail, ContactNote } from "../../../models/contact.model";
import { noteErrorText, type NoteView } from "../../../utils/contactNotes";
import { Callout } from "../../Callout/Callout";
import { SkeletonBox, SkeletonLine } from "../../Skeleton/Skeleton";
import { NoteComposer } from "./NoteComposer";
import { NoteItem } from "./NoteItem";
import { NoteActionsSheet, NoteDeleteSheet } from "./NoteSheets";
import { updatePendingNotes, usePendingNotes, type PendingNote } from "./pendingNotes";

/**
 * El borrador de nota nueva de cada contacto, mientras viva la pestaña: si se
 * cambia de chat o se cierra la ficha, sigue ahí al volver (diseño, «Guardar
 * explícito, borrador que no se pierde»).
 */
const drafts = new Map<string, string>();

/** Cuánto se marca «Nueva» una nota que llegó de otra persona. */
const FRESH_MS = 6000;

const EMPTY_PLACEHOLDER = 'Apunta lo que no quieras olvidar. Ej.: paga a 30 días, prefiere que le escriban por la tarde.';

interface Editing { id: string; text: string; baseText: string; baseEditedAt: string | null; error: string | null }

interface Props {
    contact: ContactDetail;
    /** Cuántas se ven de entrada: 3 en la ficha del chat, 5 en Contactos. */
    initialVisible: number;
    /** En Contactos la tarjeta lleva borde; en la ficha del chat, el fondo gris ya la separa. */
    bordered?: boolean;
}

/**
 * Las notas del contacto (diseño `Wasmish Notas del contacto`): arriba se
 * escribe, debajo la lista de la más nueva a la más vieja, cada una con quién
 * y cuándo. Lo nuevo aparece al momento; lo que no se guardó o no se borró se
 * queda con «Reintentar»; lo que cambia otra persona llega en vivo
 * (`contact_updated`) sin tocar lo que se está escribiendo.
 */
export const ContactNotesCard = ({ contact, initialVisible, bordered = false }: Props) => {
    const { user } = useAuthContext();
    const myId = user?.id;
    const { add, edit, remove } = useContactNoteMutations(contact.id);
    const notes = contact.noteList;

    const [draft, setDraftState] = useState(() => drafts.get(contact.id) ?? '');
    const [composerOpen, setComposerOpen] = useState(() => Boolean(drafts.get(contact.id)));
    const pending = usePendingNotes(contact.id);
    const setPending = (change: (notes: PendingNote[]) => PendingNote[]) => updatePendingNotes(contact.id, change);
    const [editing, setEditing] = useState<Editing | null>(null);
    const [confirmingId, setConfirmingId] = useState<string | null>(null);
    const [removing, setRemoving] = useState<Set<string>>(new Set());
    const [deleteErrors, setDeleteErrors] = useState<Map<string, string>>(new Map());
    const [expanded, setExpanded] = useState(false);
    const [sheet, setSheet] = useState<{ kind: 'actions' | 'delete'; id: string } | null>(null);

    // «Nueva»: las que aparecen en la lista sin haberlas escrito aquí.
    const seen = useRef(new Set(notes.map(note => note.id)));
    const [fresh, setFresh] = useState<Set<string>>(new Set());
    useEffect(() => {
        const arrived = notes.filter(note => !seen.current.has(note.id)).map(note => note.id);
        notes.forEach(note => seen.current.add(note.id));
        if (arrived.length === 0) return;
        setFresh(current => new Set([...current, ...arrived]));
        const timer = setTimeout(() => setFresh(current => new Set([...current].filter(id => !arrived.includes(id)))), FRESH_MS);
        return () => clearTimeout(timer);
    }, [notes]);

    const setDraft = (text: string) => {
        setDraftState(text);
        if (text) drafts.set(contact.id, text);
        else drafts.delete(contact.id);
    };

    // Cada guardado espera su propia respuesta: con `mutate`, React Query solo
    // avisa al último, y una nota guardada antes se quedaba en «Guardando…»
    // (revisión de Codex del PR #89). Va al almacén de fuera, no al estado: la
    // ficha puede haberse cerrado cuando responda.
    const save = async (key: string, text: string) => {
        try {
            const note = await add.mutateAsync(text.trim());
            seen.current.add(note.id);
            setPending(current => current.filter(item => item.key !== key));
        } catch (error) {
            setPending(current => current.map(item => (item.key === key ? { ...item, error: noteErrorText(error) } : item)));
        }
    };

    const addNote = (text = draft) => {
        const key = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setPending(current => [{ key, text: text.trim(), error: null }, ...current]);
        if (text === draft) {
            setDraft('');
            setComposerOpen(false);
        }
        void save(key, text);
    };

    const retryPending = (item: PendingNote) => {
        setPending(current => current.map(other => (other.key === item.key ? { ...other, error: null } : other)));
        void save(item.key, item.text);
    };

    const startEditing = (note: ContactNote) => {
        setConfirmingId(null);
        setEditing({ id: note.id, text: note.text, baseText: note.text, baseEditedAt: note.editedAt, error: null });
    };

    // Al responder, solo se cierra si el campo sigue en esa nota y con lo que se
    // envió: lo que se escribió mientras tanto no se pierde (revisión de Codex
    // del PR #89). Si no, lo guardado pasa a ser la versión de referencia.
    const saveEdit = async () => {
        if (!editing) return;
        const { id, text } = editing;
        const sent = text.trim();
        try {
            const saved = await edit.mutateAsync({ noteId: id, text: sent });
            setEditing(state => {
                if (!state || state.id !== id) return state;
                if (state.text.trim() === sent) return null;
                return { ...state, baseText: saved.text, baseEditedAt: saved.editedAt, error: null };
            });
        } catch (error) {
            setEditing(state => (state && state.id === id ? { ...state, error: noteErrorText(error) } : state));
        }
    };

    const deleteNote = async (id: string) => {
        setConfirmingId(null);
        setSheet(null);
        setRemoving(current => new Set(current).add(id));
        setDeleteErrors(current => { const next = new Map(current); next.delete(id); return next; });
        try {
            await remove.mutateAsync(id);
        } catch (error) {
            setDeleteErrors(current => new Map(current).set(id, noteErrorText(error)));
        } finally {
            setRemoving(current => { const next = new Set(current); next.delete(id); return next; });
        }
    };

    // La nota que se edita, tal como está ahora en el servidor: si otra persona
    // la cambió o la borró, se avisa dentro del campo (D14, D15).
    const editedNow = editing ? notes.find(note => note.id === editing.id) : undefined;
    const editingGone = Boolean(editing && !editedNow);
    const editingChanged = Boolean(editing && editedNow && editedNow.text !== editing.baseText
        && editedNow.editedAt !== editing.baseEditedAt);

    // La de antes siempre al final: es la más vieja.
    const visibleNotes = notes
        .filter(note => !removing.has(note.id))
        .sort((a, b) => Number(a.source === 'legacy') - Number(b.source === 'legacy'));
    const total = visibleNotes.length + pending.length;
    const shown = expanded ? visibleNotes : visibleNotes.slice(0, Math.max(initialVisible - pending.length, 0));
    const hidden = visibleNotes.length - shown.length;
    const sheetNote = sheet ? notes.find(note => note.id === sheet.id) ?? null : null;
    const isMine = (note: NoteView) => Boolean(note.author && note.author.id === myId);
    const empty = total === 0 && !editingGone;

    const editor = (note: ContactNote) => (
        <NoteComposer
            ariaLabel="Editar la nota"
            value={editing!.text}
            onChange={text => setEditing(state => state && { ...state, text, error: null })}
            onSave={() => void saveEdit()}
            onCancel={() => setEditing(null)}
            autoFocus
            error={editing!.error}
            notice={editingChanged ? (
                <Callout tone="warning" icon={<AlertTriangle size={15} />}
                    title={`${note.editedBy?.name ?? 'Otra persona'} la cambió hace un momento.`}>
                    Si guardas, tu versión reemplaza la suya.
                </Callout>
            ) : null}
        />
    );

    return (
        <section aria-label="Notas del contacto"
            className={`bg-brand-surface rounded-xl border p-3.5 grid gap-2.5 ${bordered ? 'border-brand-border' : 'border-transparent'}`}>
            <div className="flex items-center gap-2">
                <Pencil size={15} className="text-brand-text" />
                <h3 className="text-sm font-bold text-brand-text">Notas</h3>
                {total > 0 && <span className="font-mono text-xs text-brand-subtle tabular-nums">{total}</span>}
                {expanded && total > initialVisible && (
                    <button type="button" onClick={() => setExpanded(false)}
                        className="ml-auto text-[12.5px] font-semibold text-brand-accent-strong hover:underline cursor-pointer">
                        Mostrar menos
                    </button>
                )}
            </div>

            {empty || composerOpen ? (
                <NoteComposer
                    ariaLabel="Nota nueva"
                    value={draft}
                    onChange={setDraft}
                    onSave={() => addNote()}
                    onCancel={empty ? undefined : () => { setDraft(''); setComposerOpen(false); }}
                    placeholder={empty ? EMPTY_PLACEHOLDER : 'Escribe la nota'}
                    autoFocus={composerOpen}
                />
            ) : (
                <button type="button" onClick={() => setComposerOpen(true)}
                    className="h-10 w-full rounded-[10px] border border-brand-border-strong bg-brand-surface px-3
                        flex items-center gap-2 text-sm text-brand-subtle hover:bg-brand-bg transition-colors cursor-pointer">
                    <Plus size={15} />Añadir una nota
                </button>
            )}

            {editing && editingGone && (
                <div className="grid gap-2">
                    <Callout tone="warning" icon={<AlertTriangle size={15} />} title="Esta nota se borró.">
                        Tu texto sigue aquí.
                    </Callout>
                    <NoteComposer
                        ariaLabel="Texto de la nota borrada"
                        value={editing.text}
                        onChange={text => setEditing(state => state && { ...state, text })}
                        onSave={() => { addNote(editing.text); setEditing(null); }}
                        onCancel={() => setEditing(null)}
                        saveLabel="Guardar como nueva"
                        cancelLabel="Descartar"
                        autoFocus
                    />
                </div>
            )}

            {total > 0 && (
                <ul className="grid gap-0.5">
                    {pending.map(item => (
                        <NoteItem key={item.key} mine
                            note={{ id: item.key, text: item.text, author: user ? { id: user.id, name: user.name, active: true } : null,
                                source: 'manual', createdAt: new Date().toISOString(), editedAt: null, editedBy: null, canEdit: false }}
                            saving={!item.error}
                            failure={item.error ? {
                                title: 'No se pudo guardar.', message: `Tu texto sigue aquí; ${item.error.charAt(0).toLowerCase()}${item.error.slice(1)}`,
                                onRetry: () => retryPending(item),
                                onDiscard: () => setPending(current => current.filter(other => other.key !== item.key)),
                            } : null}
                        />
                    ))}
                    {shown.map(note => {
                        const deleteError = deleteErrors.get(note.id);
                        return (
                            <NoteItem key={note.id} note={note} mine={isMine(note)}
                                fresh={fresh.has(note.id)}
                                editor={editing?.id === note.id ? editor(note) : null}
                                failure={deleteError ? {
                                    title: 'No se pudo borrar.', message: deleteError, onRetry: () => void deleteNote(note.id),
                                } : null}
                                confirmDelete={confirmingId === note.id ? {
                                    onConfirm: () => void deleteNote(note.id), onCancel: () => setConfirmingId(null),
                                } : null}
                                onEdit={() => startEditing(note)}
                                onDelete={() => { setEditing(null); setConfirmingId(note.id); }}
                                onOpenActions={() => setSheet({ kind: 'actions', id: note.id })}
                            />
                        );
                    })}
                </ul>
            )}

            {hidden > 0 && (
                <button type="button" onClick={() => setExpanded(true)}
                    className="h-9 w-full rounded-[10px] bg-brand-bg flex items-center justify-center gap-1.5
                        text-[13px] font-semibold text-brand-accent-strong hover:bg-brand-raised transition-colors cursor-pointer">
                    Ver {hidden} {hidden === 1 ? 'nota' : 'notas'} más <ChevronDown size={15} />
                </button>
            )}

            <NoteActionsSheet
                note={sheet?.kind === 'actions' ? sheetNote : null}
                mine={sheetNote ? isMine(sheetNote) : false}
                onEdit={() => { if (sheetNote) startEditing(sheetNote); setSheet(null); }}
                onDelete={() => setSheet(sheet && { kind: 'delete', id: sheet.id })}
                onClose={() => setSheet(null)}
            />
            <NoteDeleteSheet
                note={sheet?.kind === 'delete' ? sheetNote : null}
                mine={sheetNote ? isMine(sheetNote) : false}
                onConfirm={() => { if (sheet) void deleteNote(sheet.id); }}
                onClose={() => setSheet(null)}
            />
        </section>
    );
};

/** La tarjeta mientras carga la ficha (diseño D17): el campo y tres notas. */
export const ContactNotesSkeleton = ({ bordered = false }: { bordered?: boolean }) => (
    <section className={`bg-brand-surface rounded-xl border p-3.5 grid gap-3 ${bordered ? 'border-brand-border' : 'border-transparent'}`}>
        <div className="flex items-center gap-2">
            <Pencil size={15} className="text-brand-text" />
            <h3 className="text-sm font-bold text-brand-text">Notas</h3>
        </div>
        <SkeletonBox tone="soft" className="h-10 w-full rounded-[10px]" />
        {['40%', '52%', '44%'].map(width => (
            <div key={width} className="grid gap-2">
                <div className="flex items-center gap-1.5">
                    <SkeletonBox className="w-5 h-5 rounded-[6px]" />
                    <SkeletonLine width={width} />
                </div>
                <SkeletonLine soft width="100%" />
                <SkeletonLine soft width="62%" />
            </div>
        ))}
    </section>
);
