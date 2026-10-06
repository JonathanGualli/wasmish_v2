import { useEffect } from "react";
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

export const useContact = (id: string | null) => {
    return useQuery<ContactDetail>({
        queryKey: ['contacts', 'detail', id],
        queryFn: () => getContactService(id!),
        enabled: Boolean(id),
    });
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
 * Crear, editar y borrar. Todas refrescan la lista y la ficha, y también la
 * bandeja de Chats (el nombre del contacto es el título de su conversación) y
 * las etiquetas (sus números cambian al ponerlas o quitarlas).
 */
export const useContactMutations = () => {
    const queryClient = useQueryClient();
    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: ['contacts'] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        queryClient.invalidateQueries({ queryKey: ['tags'] });
    };

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

    return { create, update, remove };
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
