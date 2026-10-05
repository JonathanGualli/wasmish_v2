import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import type { Template, TemplateHeaderMedia } from "../models/template.model";
import { uploadHeaderMediaFileService } from "../services/api.service";
import { headerFileIssue, headerMediaRule } from "../utils/templateHeader";
import { parseError } from "./useTemplates";

/** El archivo que se está subiendo, con lo que lleva enviado. */
export interface PendingHeaderFile {
    name: string;
    size: number;
    loadedBytes: number;
}

/** «El archivo no es un PNG válido.» → «el archivo no es un PNG válido.», para ir tras los dos puntos. */
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/**
 * Subir el archivo de la cabecera para UN envío, sin tocar el de la plantilla.
 * Comprueba tipo y peso antes de subir, cuenta el progreso y deja cancelar.
 * Mientras sube no admite otro. Lo subido le llega a `onUploaded`: dónde se
 * guarda (el borrador de la campaña, un formulario) lo decide quien lo usa.
 */
export const useHeaderMediaUpload = (template: Template | undefined, onUploaded: (media: TemplateHeaderMedia) => void) => {
    const [pending, setPending] = useState<PendingHeaderFile | null>(null);
    const [error, setError] = useState<string | null>(null);
    const controllerRef = useRef<AbortController | null>(null);

    // La subida termina segundos después: tiene que llamar al `onUploaded` de
    // ese momento, no al del render en que empezó (guardaría un borrador viejo).
    const onUploadedRef = useRef(onUploaded);
    useEffect(() => { onUploadedRef.current = onUploaded; });

    // Salir de la página a mitad no deja la petición colgando.
    useEffect(() => () => controllerRef.current?.abort(), []);

    const start = (file: File) => {
        const rule = headerMediaRule(template);
        if (!template || !rule || pending) return;

        const issue = headerFileIssue(rule, file);
        setError(issue);
        if (issue) return;

        const controller = new AbortController();
        controllerRef.current = controller;
        setPending({ name: file.name, size: file.size, loadedBytes: 0 });

        uploadHeaderMediaFileService(template.templateId, file, {
            signal: controller.signal,
            onProgress: loadedBytes => setPending(current => current && { ...current, loadedBytes }),
        })
            .then(media => onUploadedRef.current(media))
            .catch(err => {
                if (axios.isCancel(err)) return;
                setError(`No se pudo guardar «${file.name}»: ${lowerFirst(parseError(err, 'Inténtalo de nuevo.'))}`);
            })
            .finally(() => {
                // Si se canceló, `reset` ya limpió y puede haber empezado otra.
                if (controllerRef.current !== controller) return;
                controllerRef.current = null;
                setPending(null);
            });
    };

    /** Cancela la subida en curso (si la hay) y borra el error. */
    const reset = useCallback(() => {
        controllerRef.current?.abort();
        controllerRef.current = null;
        setPending(null);
        setError(null);
    }, []);

    return { pending, error, start, reset };
};

export type HeaderMediaUpload = ReturnType<typeof useHeaderMediaUpload>;
