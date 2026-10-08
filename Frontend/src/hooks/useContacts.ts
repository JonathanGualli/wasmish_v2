import { useCallback, useEffect } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSSE } from "../context/sse.context";
import { useThrottledInvalidate } from "./useThrottledInvalidate";
import type { AxiosError } from "axios";
import {
    createContactService, deleteContactService, getContactService, getContactsService, updateContactService,
} from "../services/api.service";
import type { ContactDetail, ContactFilter, ContactInput, ContactsPage } from "../models/contact.model";

export const useContacts = (pageIndex: number, pageSize: number, search: string, filter: ContactFilter, tagIds: string[] = []) => {
    const { subscribe } = useSSE();

    // Un mensaje cambia la «última interacción», abre la ventana o trae un
    // contacto nuevo, y `contact_updated` es una baja o un alta de publicidad:
    // la lista y la ficha se refrescan, como la bandeja. Agrupado: una campaña
    // dispara cientos de `message_created` seguidos.
    const refresh = useThrottledInvalidate(['contacts']);
    useEffect(() => {
        const unsubMessage = subscribe("message_created", refresh);
        const unsubContact = subscribe("contact_updated", refresh);
        return () => {
            unsubMessage();
            unsubContact();
        };
    }, [subscribe, refresh]);

    return useQuery<ContactsPage>({
        // pageIndex es 0-based (react-table); la API es 1-based
        queryKey: ['contacts', 'list', pageIndex, pageSize, search, filter, tagIds],
        queryFn: () => getContactsService(pageIndex + 1, pageSize, search, filter, tagIds),
        placeholderData: keepPreviousData,
    });
};

const detailKey = (id: string | null) => ['contacts', 'detail', id];

export const useContact = (id: string | null) => {
    return useQuery<ContactDetail>({
        queryKey: detailKey(id),
        queryFn: () => getContactService(id!),
        enabled: Boolean(id),
    });
};

/**
 * Un contacto que se ve junto a su conversación (la ficha del chat). Sus cifras
 * cambian con cada mensaje de esa conversación, y `contact_updated` trae una
 * baja de publicidad o un cambio de número: se vuelve a pedir solo entonces.
 */
export const useLiveContact = (id: string, conversationId: string) => {
    const { subscribe } = useSSE();
    const refresh = useThrottledInvalidate(detailKey(id));
    useEffect(() => {
        const unsubMessage = subscribe("message_created", payload => {
            if (payload.conversationId === conversationId) refresh();
        });
        const unsubContact = subscribe("contact_updated", payload => {
            if (payload.id === id) refresh();
        });
        return () => {
            unsubMessage();
            unsubContact();
        };
    }, [subscribe, refresh, id, conversationId]);

    return useContact(id);
};

/**
 * El contacto que ya tiene ese teléfono, si hay alguno: para avisar del
 * duplicado mientras se escribe, antes de guardar. `phone` vacío = no buscar.
 */
export const useContactByPhone = (phone: string) => {
    const query = useQuery<ContactsPage>({
        queryKey: ['contacts', 'by-phone', phone],
        queryFn: () => getContactsService(1, 5, phone, 'all'),
        enabled: Boolean(phone),
        staleTime: 30_000,
    });
    // La búsqueda casa por subcadena: aquí solo vale el número exacto.
    return query.data?.contacts.find(c => c.phone === phone);
};

/**
 * Lo que hay que volver a pedir tras cambiar contactos: la lista y la ficha, la
 * bandeja de Chats (el nombre del contacto es el título de su conversación) y
 * las etiquetas (sus números cambian al ponerlas o quitarlas).
 */
export const useRefreshContacts = () => {
    const queryClient = useQueryClient();
    return useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['contacts'] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        queryClient.invalidateQueries({ queryKey: ['tags'] });
    }, [queryClient]);
};

/** Crear, editar y borrar. Crear y editar refrescan todo lo que depende de los contactos. */
export const useContactMutations = () => {
    const queryClient = useQueryClient();
    const refresh = useRefreshContacts();

    const create = useMutation<ContactDetail, unknown, ContactInput>({
        mutationFn: createContactService,
        onSuccess: refresh,
    });

    const update = useMutation<ContactDetail, unknown, { id: string; input: ContactInput }>({
        mutationFn: ({ id, input }) => updateContactService(id, input),
        onSuccess: refresh,
    });

    // Al borrar no se refresca la ficha: ya no existe, y pedirla daría un 404
    // justo antes de cerrarse. Un contacto sin conversación no sale en la bandeja.
    const remove = useMutation<void, unknown, string>({
        mutationFn: deleteContactService,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['contacts', 'list'] });
            queryClient.invalidateQueries({ queryKey: ['contacts', 'by-phone'] });
            queryClient.invalidateQueries({ queryKey: ['tags'] });
        },
    });

    // Las notas se guardan solas mientras se escriben (la ficha del chat): basta
    // con poner al día la ficha. Ni la bandeja ni las etiquetas dependen de
    // ellas, y la lista de Contactos se vuelve a pedir cuando se abra.
    const saveNotes = useMutation<ContactDetail, unknown, { id: string; notes: string }>({
        mutationFn: ({ id, notes }) => updateContactService(id, { notes }),
        onSuccess: (saved, { id }) => {
            queryClient.setQueryData<ContactDetail>(detailKey(id), old => old && { ...old, notes: saved.notes });
            queryClient.invalidateQueries({ queryKey: ['contacts', 'list'], refetchType: 'none' });
        },
    });

    // Las etiquetas de la ficha del chat se guardan al ponerlas o quitarlas: se
    // ven al momento y, si falla, vuelven a como estaban.
    const setTags = useMutation<ContactDetail, unknown, { id: string; tagIds: string[] }, { previous?: ContactDetail }>({
        mutationFn: ({ id, tagIds }) => updateContactService(id, { tagIds }),
        onMutate: async ({ id, tagIds }) => {
            await queryClient.cancelQueries({ queryKey: detailKey(id) });
            const previous = queryClient.getQueryData<ContactDetail>(detailKey(id));
            queryClient.setQueryData<ContactDetail>(detailKey(id), old => old && { ...old, tagIds });
            return { previous };
        },
        onError: (_err, { id }, context) => queryClient.setQueryData(detailKey(id), context?.previous),
        onSettled: refresh,
    });

    return { create, update, remove, saveNotes, setTags };
};

interface ContactErrorItem { message: string; field?: string; contactId?: string | null }

/**
 * El error de una mutación en una forma útil para la UI. Un 409 por número
 * duplicado trae el id del contacto que ya lo tiene, para ofrecer «Ver contacto».
 */
export const contactError = (err: unknown): ContactErrorItem => {
    const data = (err as AxiosError<ContactErrorItem[] | ContactErrorItem>).response?.data;
    const first = Array.isArray(data) ? data[0] : data;
    return {
        message: first?.message ?? 'No se pudo guardar el contacto. Inténtalo de nuevo.',
        field: first?.field,
        contactId: first?.contactId ?? null,
    };
};
