import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createContactNoteService, deleteContactNoteService, updateContactNoteService } from "../services/api.service";
import type { ContactDetail, ContactNote } from "../models/contact.model";

const detailKey = (contactId: string) => ['contacts', 'detail', contactId];

/**
 * Añadir, editar y borrar las notas de un contacto. Al responder el servidor
 * se pone al día la ficha en la caché (sin esperar al `contact_updated` que
 * llega a las demás pestañas). Lo que se ve antes de que responda (la nota que
 * se está guardando, la que se está borrando) lo lleva `ContactNotesCard`.
 */
export const useContactNoteMutations = (contactId: string) => {
    const queryClient = useQueryClient();
    const setNotes = (change: (notes: ContactNote[]) => ContactNote[]) =>
        queryClient.setQueryData<ContactDetail>(detailKey(contactId), old => old && { ...old, noteList: change(old.noteList) });

    const add = useMutation<ContactNote, unknown, string>({
        mutationFn: text => createContactNoteService(contactId, text),
        onSuccess: note => setNotes(notes => [note, ...notes.filter(other => other.id !== note.id)]),
    });

    const edit = useMutation<ContactNote, unknown, { noteId: string; text: string }>({
        mutationFn: ({ noteId, text }) => updateContactNoteService(contactId, noteId, text),
        onSuccess: note => setNotes(notes => notes.map(other => (other.id === note.id ? note : other))),
    });

    const remove = useMutation<void, unknown, string>({
        mutationFn: noteId => deleteContactNoteService(contactId, noteId),
        onSuccess: (_data, noteId) => setNotes(notes => notes.filter(note => note.id !== noteId)),
    });

    return { add, edit, remove };
};
