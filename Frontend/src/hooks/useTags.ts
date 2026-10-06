import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import {
    bulkTagContactsService, createTagService, deleteTagService, getTagsService, renameTagService, tagSelectionSummaryService,
} from "../services/api.service";
import type { CampaignRecipientsInput } from "../models/campaign.model";
import type { BulkTagResult, Tag, TagSelectionSummary } from "../models/tag.model";

/** Las etiquetas de la cuenta, por nombre, con cuántos contactos tiene cada una. */
export const useTags = () => useQuery<Tag[]>({
    queryKey: ['tags'],
    queryFn: getTagsService,
    staleTime: 30_000,
});

/** Cuántos de la selección tienen cada etiqueta: los números del menú «Etiquetar». */
export const useTagSelectionSummary = (selection: CampaignRecipientsInput, enabled: boolean) => useQuery<TagSelectionSummary>({
    queryKey: ['tags', 'summary', selection],
    queryFn: () => tagSelectionSummaryService(selection),
    enabled,
});

/**
 * Crear, renombrar y borrar etiquetas, y etiquetar en bloque. Renombrar no
 * toca los contactos (guardan el id); borrar y etiquetar sí, y cambian los
 * números de cada etiqueta.
 */
export const useTagMutations = () => {
    const queryClient = useQueryClient();
    const refreshTags = () => queryClient.invalidateQueries({ queryKey: ['tags'] });
    const refreshAll = () => {
        refreshTags();
        queryClient.invalidateQueries({ queryKey: ['contacts'] });
    };

    const create = useMutation<Tag, unknown, string>({ mutationFn: createTagService, onSuccess: refreshTags });

    const rename = useMutation<Tag, unknown, { id: string; name: string }>({
        mutationFn: ({ id, name }) => renameTagService(id, name),
        onSuccess: refreshTags,
    });

    const remove = useMutation<{ removedFrom: number }, unknown, string>({ mutationFn: deleteTagService, onSuccess: refreshAll });

    const bulk = useMutation<BulkTagResult, unknown, { selection: CampaignRecipientsInput; add: string[]; remove: string[] }>({
        mutationFn: ({ selection, add, remove }) => bulkTagContactsService(selection, add, remove),
        onSuccess: refreshAll,
    });

    /**
     * Las etiquetas nuevas que se escribieron en un selector se crean al
     * confirmar, no al escribirlas: cancelar no deja etiquetas vacías. Crear es
     * idempotente, así que una que se creó a la vez en otra pestaña devuelve esa.
     */
    const createMissing = async (names: string[]) => Promise.all(names.map(name => create.mutateAsync(name)));

    return { create, rename, remove, bulk, createMissing };
};

/** El mensaje de error de la API de etiquetas («Ya hay una etiqueta «VIP»»). */
export const tagError = (err: unknown, fallback = 'No se pudo guardar la etiqueta. Inténtalo de nuevo.') => {
    const data = (err as AxiosError<{ message: string }[]>).response?.data;
    return (Array.isArray(data) && data[0]?.message) || fallback;
};
