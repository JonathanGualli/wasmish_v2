import { useCallback } from "react";
import { useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import axios, { type AxiosError } from "axios";
import { sendMediaMessageService } from "../services/api.service";
import type { Message } from "../models/message.mode";
import { OUTBOUND_KIND_LABEL, outboundMediaKind, outboundMimeType } from "../utils/outboundMedia";

export interface MediaSendInput {
    conversationId: string;
    file: File;
    /** El texto que lo acompaña. Vacío en los audios: WhatsApp no se lo pone. */
    caption: string;
    /** Una imagen como documento: sin comprimir y hasta 16 MB. */
    asDocument: boolean;
}

type MessagesPage = { items: Message[]; nextCursor: string | undefined };

/**
 * Los envíos en curso o que no llegaron al servidor, por `temporalId`: para
 * cancelarlos y para reintentar sin volver a elegir el archivo, que sigue aquí.
 * Viven lo que viva la pestaña.
 */
const uploads = new Map<string, { input: MediaSendInput; localUrl: string; controller: AbortController | null }>();

const conversationKey = (conversationId: string) => ["conversation", conversationId];

// Nunca mutar la caché: cada página y cada mensaje que cambia es un objeto nuevo.
const updateMessages = (queryClient: QueryClient, conversationId: string, update: (items: Message[]) => Message[]) =>
    queryClient.setQueryData<InfiniteData<MessagesPage>>(conversationKey(conversationId), old => old && {
        ...old,
        pages: old.pages.map(page => ({ ...page, items: update(page.items) })),
    });

const patchMessage = (queryClient: QueryClient, conversationId: string, temporalId: string, patch: (msg: Message) => Message) =>
    updateMessages(queryClient, conversationId, items => items.map(msg => (msg.temporalId === temporalId ? patch(msg) : msg)));

const insertMessage = (queryClient: QueryClient, conversationId: string, msg: Message) =>
    queryClient.setQueryData<InfiniteData<MessagesPage>>(conversationKey(conversationId), old => {
        if (!old) return { pages: [{ items: [msg], nextCursor: undefined }], pageParams: [undefined] };
        const pages = [...old.pages];
        pages[0] = { ...pages[0], items: [msg, ...pages[0].items] };
        return { ...old, pages };
    });

// Ya no hace falta el archivo en el navegador (llegó, se canceló o se descartó).
const forget = (temporalId: string) => {
    const upload = uploads.get(temporalId);
    if (upload) URL.revokeObjectURL(upload.localUrl);
    uploads.delete(temporalId);
};

/** Lo que se ve mientras sube: lo mismo que pondrá el backend. */
const optimisticMessage = (input: MediaSendInput, temporalId: string, localUrl: string): Message => {
    const kind = outboundMediaKind(outboundMimeType(input.file), input.asDocument) ?? 'document';
    return {
        id: temporalId,
        temporalId,
        conversationId: input.conversationId,
        sender: "me",
        type: kind,
        text: input.caption || (kind === 'document' ? input.file.name : OUTBOUND_KIND_LABEL[kind]),
        caption: input.caption || null,
        mediaFilename: kind === 'document' ? input.file.name : null,
        mediaSize: input.file.size,
        timestamp: new Date().toISOString(),
        status: "sent",
        pending: { localUrl, loadedBytes: 0, totalBytes: input.file.size },
    };
};

/**
 * Enviar un archivo a una conversación, con UI optimista: el mensaje aparece
 * al momento con el archivo (desde el navegador) y el progreso real de la
 * subida, y se puede cancelar. Al volver del servidor lo sustituye el de
 * verdad (el `message_created` del SSE no lo duplica: lleva el `temporalId`).
 *
 * Si no llega al servidor (se cortó la conexión), queda fallido y se puede
 * reintentar. Si el servidor lo rechaza (la ventana se cerró, el formato), queda
 * fallido con su motivo. Si lo rechaza WhatsApp, el servidor lo guarda fallido
 * con su código, como un texto.
 */
export const useSendMediaMessage = () => {
    const queryClient = useQueryClient();

    const run = useCallback(async (temporalId: string) => {
        const upload = uploads.get(temporalId);
        if (!upload) return;
        const { input } = upload;
        const controller = new AbortController();
        upload.controller = controller;

        try {
            const saved = await sendMediaMessageService(input.conversationId, {
                file: input.file,
                mimeType: outboundMimeType(input.file),
                caption: input.caption,
                temporalId,
                asDocument: input.asDocument,
            }, {
                signal: controller.signal,
                onProgress: loadedBytes => patchMessage(queryClient, input.conversationId, temporalId, msg =>
                    (msg.pending ? { ...msg, pending: { ...msg.pending, loadedBytes } } : msg)),
            });
            patchMessage(queryClient, input.conversationId, temporalId, () => saved);
            forget(temporalId);
        } catch (err) {
            upload.controller = null;
            if (axios.isCancel(err)) {
                updateMessages(queryClient, input.conversationId, items => items.filter(msg => msg.temporalId !== temporalId));
                forget(temporalId);
                return;
            }
            const response = (err as AxiosError<{ message: string }[]>).response;
            // Sin respuesta, o un fallo del servidor antes de guardar nada: no se
            // envió, y el archivo sigue aquí para reintentarlo.
            const retryable = !response || response.status >= 500;
            const errorDetail = response?.data?.[0]?.message ?? 'No se pudo subir el archivo: revisa la conexión.';
            patchMessage(queryClient, input.conversationId, temporalId, msg => ({
                ...msg,
                status: "failed",
                errorDetail,
                pending: msg.pending && { ...msg.pending, retryable },
            }));
            // Sin reintento, el mensaje se queda con su archivo a la vista, pero
            // ya no hace falta guardarlo para volver a mandarlo.
            if (!retryable) uploads.delete(temporalId);
        }
    }, [queryClient]);

    const send = useCallback((input: MediaSendInput) => {
        const temporalId = crypto.randomUUID();
        const localUrl = URL.createObjectURL(input.file);
        uploads.set(temporalId, { input, localUrl, controller: null });
        void queryClient.cancelQueries({ queryKey: conversationKey(input.conversationId) });
        insertMessage(queryClient, input.conversationId, optimisticMessage(input, temporalId, localUrl));
        void run(temporalId);
    }, [queryClient, run]);

    const retry = useCallback((conversationId: string, temporalId: string) => {
        if (!uploads.has(temporalId)) return;
        patchMessage(queryClient, conversationId, temporalId, msg => ({
            ...msg,
            status: "sent",
            errorDetail: undefined,
            pending: msg.pending && { ...msg.pending, loadedBytes: 0, retryable: false },
        }));
        void run(temporalId);
    }, [queryClient, run]);

    /** Cancelar mientras sube, o descartar uno que no se pudo subir. */
    const discard = useCallback((conversationId: string, temporalId: string) => {
        const upload = uploads.get(temporalId);
        // Subiendo: al abortar, el propio envío quita el mensaje.
        if (upload?.controller) return upload.controller.abort();
        updateMessages(queryClient, conversationId, items => items.filter(msg => msg.temporalId !== temporalId));
        forget(temporalId);
    }, [queryClient]);

    return { send, retry, discard };
};
