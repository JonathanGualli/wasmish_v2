import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { importContactsService, previewContactImportService } from "../services/api.service";
import type { ImportInput, ImportPreview } from "../models/contactImport.model";
import { useRefreshContacts } from "./useContacts";

/** Qué salió mal al comprobar o guardar, en palabras. `title` va en negrita; `detail`, después. */
export const importError = (err: unknown) => {
    const response = (err as AxiosError<{ message?: string }[]>).response;
    if (!response) return { title: 'Se cortó la conexión.', detail: null };
    if (response.status === 413) {
        return { title: 'El archivo es demasiado grande para comprobarlo de una vez.', detail: 'Divídelo en dos e impórtalos por separado; no se duplica nadie.' };
    }
    const message = Array.isArray(response.data) ? response.data[0]?.message : null;
    return { title: 'El servidor no pudo con el archivo.', detail: message ?? 'Inténtalo de nuevo en un momento.' };
};

/** La vista previa: qué pasaría con el archivo entero, sin guardar nada. */
export const useImportPreview = () => useMutation<ImportPreview, unknown, ImportInput>({
    mutationFn: previewContactImportService,
});

export type ImportRunStatus = 'idle' | 'running' | 'failed' | 'done';

interface ImportRunState {
    status: ImportRunStatus;
    created: number;
    updated: number;
    unchanged: number;
    /** Todos los contactos del archivo: los nuevos, los completados y los sin cambios. */
    contactIds: string[];
    error: ReturnType<typeof importError> | null;
}

const IDLE: ImportRunState = { status: 'idle', created: 0, updated: 0, unchanged: 0, contactIds: [], error: null };

/**
 * Guardar el archivo, tanda a tanda y una detrás de otra. Si una falla se
 * para ahí: `retry` sigue desde esa, sin repetir las que ya entraron (y
 * repetirla tampoco duplicaría nada). Al salir de la página no se manda
 * ninguna tanda más; lo guardado se queda.
 */
export const useImportRun = () => {
    const refreshContacts = useRefreshContacts();
    const [state, setState] = useState<ImportRunState>(IDLE);
    const job = useRef<{ batches: ImportInput[]; next: number } | null>(null);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    const runPending = useCallback(async () => {
        const current = job.current;
        if (!current) return;
        setState(s => ({ ...s, status: 'running', error: null }));
        while (current.next < current.batches.length) {
            try {
                const { summary, contactIds } = await importContactsService({ ...current.batches[current.next], consent: true });
                current.next += 1;
                if (!mounted.current) return;
                setState(s => ({
                    ...s,
                    created: s.created + summary.created,
                    updated: s.updated + summary.updated,
                    unchanged: s.unchanged + summary.unchanged,
                    contactIds: [...s.contactIds, ...contactIds],
                }));
            } catch (err) {
                if (mounted.current) setState(s => ({ ...s, status: 'failed', error: importError(err) }));
                return;
            }
        }
        refreshContacts();
        setState(s => ({ ...s, status: 'done' }));
    }, [refreshContacts]);

    const start = useCallback((batches: ImportInput[]) => {
        job.current = { batches, next: 0 };
        setState(IDLE);
        void runPending();
    }, [runPending]);

    const retry = useCallback(() => void runPending(), [runPending]);

    return { ...state, start, retry };
};

export type ImportRun = ReturnType<typeof useImportRun>;
