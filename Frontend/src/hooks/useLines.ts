import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { disconnectLineService, getLinesService, updateLineService } from "../services/api.service";
import { lineColorClasses } from "../utils/lineDisplay";

export const LINES_QUERY_KEY = ['lines'];

/**
 * Las líneas de WhatsApp de la cuenta y lo que se hace con ellas (Fase 2c).
 * Cada mutación vuelve a pedir la lista al terminar, haya ido bien o no: si
 * falló porque otra pestaña cambió algo, la lista enseña cómo quedó.
 */
export const useLines = () => {
    const queryClient = useQueryClient();
    const query = useQuery({ queryKey: LINES_QUERY_KEY, queryFn: getLinesService });
    const refresh = () => queryClient.invalidateQueries({ queryKey: LINES_QUERY_KEY });

    const lines = useMemo(() => query.data?.lines ?? [], [query.data]);
    const colors = useMemo(() => lineColorClasses(lines), [lines]);
    const activeLines = lines.filter(line => line.status === 'active');
    const maxLines = query.data?.maxLines ?? 1;

    const rename = useMutation({
        mutationFn: ({ id, name }: { id: string; name: string | null }) => updateLineService(id, { name }),
        onSettled: refresh,
    });
    const makeDefault = useMutation({
        mutationFn: (id: string) => updateLineService(id, { isDefault: true }),
        onSettled: refresh,
    });
    const disconnect = useMutation({
        mutationFn: (id: string) => disconnectLineService(id),
        onSettled: refresh,
    });

    return {
        isLoading: query.isLoading,
        isError: query.isError,
        lines,
        activeLines,
        previousLines: lines.filter(line => line.status === 'disconnected'),
        defaultLine: lines.find(line => line.isDefault) ?? null,
        nextDefaultLine: lines.find(line => line.id === query.data?.nextDefaultLineId) ?? null,
        maxLines,
        /** Plan de varias líneas o más de una conectada: la tarjeta pasa a «Líneas de WhatsApp». */
        isMultiLine: maxLines > 1 || activeLines.length > 1,
        colorOf: (lineId: string) => colors.get(lineId) ?? 'bg-line-1',
        rename,
        makeDefault,
        disconnect,
        refresh,
    };
};
