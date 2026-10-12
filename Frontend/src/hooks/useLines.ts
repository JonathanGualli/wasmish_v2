import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthContext } from "../context/auth.context";
import { disconnectLineService, getLinesService, updateLineService } from "../services/api.service";
import { lineColorClasses } from "../utils/lineDisplay";

export const LINES_QUERY_KEY = ['lines'];

// Cuántas líneas tenía la cuenta la última vez, para que la bandeja y el chat
// reserven el sitio de las etiquetas mientras cargan (nada aparece de golpe).
// Es una comodidad: sin storage se sigue sin ella.
const COUNT_PREFIX = 'wasmish:line-count:';

const readLineCount = (userId: string) => {
    try {
        return Number(localStorage.getItem(COUNT_PREFIX + userId)) || 0;
    } catch {
        return 0;
    }
};

const writeLineCount = (userId: string, count: number) => {
    try {
        localStorage.setItem(COUNT_PREFIX + userId, String(count));
    } catch { /* sin storage: la próxima carga no reserva sitio */ }
};

/**
 * Las líneas de WhatsApp de la cuenta y lo que se hace con ellas (Fase 2c).
 * Cada mutación vuelve a pedir la lista al terminar, haya ido bien o no: si
 * falló porque otra pestaña cambió algo, la lista enseña cómo quedó.
 */
export const useLines = () => {
    const queryClient = useQueryClient();
    const { user } = useAuthContext();
    const userId = user?.id ?? '';
    const query = useQuery({ queryKey: LINES_QUERY_KEY, queryFn: getLinesService });
    const refresh = () => queryClient.invalidateQueries({ queryKey: LINES_QUERY_KEY });

    const lines = useMemo(() => query.data?.lines ?? [], [query.data]);
    const colors = useMemo(() => lineColorClasses(lines), [lines]);
    const activeLines = lines.filter(line => line.status === 'active');
    const maxLines = query.data?.maxLines ?? 1;

    const [rememberedCount] = useState(() => (userId ? readLineCount(userId) : 0));
    useEffect(() => {
        if (userId && query.data) writeLineCount(userId, query.data.lines.length);
    }, [userId, query.data]);

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
        /** Más de una conectada: se elige por cuál enviar. */
        hasManyLines: activeLines.length > 1,
        /** Más de una, conectada o no: cada conversación y campaña dice de qué línea es. */
        showLines: lines.length > 1,
        /** Cargando, y la última vez había varias: se reserva el sitio de las etiquetas. */
        linesPending: query.isLoading && rememberedCount > 1,
        lineById: (lineId: string | null | undefined) => lines.find(line => line.id === lineId),
        colorOf: (lineId: string) => colors.get(lineId) ?? 'bg-line-1',
        rename,
        makeDefault,
        disconnect,
        refresh,
    };
};
