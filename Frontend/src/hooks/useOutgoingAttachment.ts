import { useEffect, useState } from "react";
import { outboundMediaIssue, outboundMediaKind, outboundMimeType } from "../utils/outboundMedia";

/** Una URL del navegador para enseñar el archivo antes de enviarlo; se libera al cambiarlo. */
const useObjectUrl = (file: File | null) => {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!file) {
            setUrl(null);
            return;
        }
        const objectUrl = URL.createObjectURL(file);
        setUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [file]);
    return url;
};

/**
 * El archivo que se prepara para enviar desde el chat: uno por envío. Si llegan
 * varios (al soltarlos o pegarlos), se queda el primero y `totalDropped` dice
 * cuántos eran, para explicarlo. Lo que falla (formato, peso) se calcula aquí,
 * antes de subir nada.
 */
export const useOutgoingAttachment = () => {
    const [file, setFile] = useState<File | null>(null);
    const [asDocument, setAsDocument] = useState(false);
    const [totalDropped, setTotalDropped] = useState(0);
    const previewUrl = useObjectUrl(file);

    const attach = (files: File[]) => {
        if (files.length === 0) return;
        setFile(files[0]);
        setAsDocument(false);
        setTotalDropped(files.length);
    };

    const clear = () => {
        setFile(null);
        setAsDocument(false);
        setTotalDropped(0);
    };

    const mimeType = file ? outboundMimeType(file) : '';
    return {
        file,
        mimeType,
        kind: file ? outboundMediaKind(mimeType, asDocument) : null,
        issue: file ? outboundMediaIssue(file, asDocument) : null,
        asDocument,
        previewUrl,
        totalDropped,
        attach,
        clear,
        sendAsDocument: () => setAsDocument(true),
        dismissDropped: () => setTotalDropped(1),
    };
};

export type OutgoingAttachment = ReturnType<typeof useOutgoingAttachment>;
