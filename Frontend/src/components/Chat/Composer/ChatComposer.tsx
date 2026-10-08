import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import { Clock, Download, Info, LayoutTemplate, Paperclip, SendHorizonal, X } from "lucide-react";
import type { AxiosError } from "axios";
import { useConversationSendMessages } from "../../../hooks/useConversationSendMessages";
import { formatRemaining, useConversationWindow, WINDOW_WARNING_MS } from "../../../hooks/useConversationWindow";
import { useAutosizeTextarea } from "../../../hooks/useAutosizeTextarea";
import { useFilePicker } from "../../../hooks/useFilePicker";
import { useOutgoingAttachment } from "../../../hooks/useOutgoingAttachment";
import { useSendMediaMessage } from "../../../hooks/useSendMediaMessage";
import { useWindowFileDrag } from "../../../hooks/useWindowFileDrag";
import type { Conversation } from "../../../models/conversation.mode";
import { CAPTION_MAX, OUTBOUND_ACCEPT } from "../../../utils/outboundMedia";
import { Callout } from "../../Callout/Callout";
import { CustomButton } from "../../Button/Button";
import { useNoticeContext } from "../../Notice/context/UseNoticeContext";
import { SendTemplateDialog } from "../SendTemplateDialog";
import { AttachmentPreview } from "./AttachmentPreview";

interface Props {
    conversationId: string;
    /** `undefined` mientras carga la bandeja: hasta tenerla no se sabe la ventana. */
    conversation?: Conversation;
    title: string;
}

/** Hasta 6 líneas de 21 px; luego, scroll. */
const MAX_HEIGHT = 6 * 21;

interface ErrorItem {
    message: string;
}

// Una captura pegada se llama «image.png»: se le pone un nombre que diga qué es.
const namePasted = (file: File) => {
    if (file.name && file.name !== 'image.png') return file;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}`;
    return new File([file], `Captura de pantalla ${time}.png`, { type: file.type });
};

/**
 * El campo de escribir: el sitio de todo lo que se envía. Texto, un archivo
 * (eligiéndolo, soltándolo sobre la conversación o pegándolo) o una plantilla.
 * Con la ventana de 24 h cerrada solo plantillas; si se cierra mientras se
 * prepara un envío, lo escrito y el archivo se quedan.
 *
 * Se monta una vez por conversación (`key`): cambiar de chat empieza en blanco.
 * El aviso al arrastrar se pinta sobre toda la conversación: su contenedor
 * tiene que ser `relative`.
 */
export const ChatComposer = ({ conversationId, conversation, title }: Props) => {
    const sendText = useConversationSendMessages();
    const media = useSendMediaMessage();
    const attachment = useOutgoingAttachment();
    const { setState, setContent } = useNoticeContext();
    const [text, setText] = useState("");
    const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    useAutosizeTextarea(textareaRef, text, MAX_HEIGHT);

    const { hasWindow, isOpen, msRemaining } = useConversationWindow(conversation?.windowExpiresAt);
    // Mientras carga la bandeja no se sabe la ventana: bloquear por defecto haría
    // parpadear el aviso en cada carga, así que hasta tener el dato no se bloquea.
    const windowBlocked = Boolean(conversation) && !isOpen;
    const endingSoon = isOpen && msRemaining <= WINDOW_WARNING_MS;

    const picker = useFilePicker(file => attachment.attach([file]));
    const dragging = useWindowFileDrag(!windowBlocked && !templateDialogOpen);

    useEffect(() => {
        textareaRef.current?.focus();
    }, []);

    const { file, kind, issue } = attachment;
    const noCaption = kind === 'audio';
    const canSend = file ? !issue : Boolean(text.trim());

    const showTextError = (error: Error) => {
        setContent(
            <div className="text-brand-danger text-sm">
                {(error as AxiosError<ErrorItem[]>).response?.data?.map((err, i) => (
                    <p key={i}>{err.message}</p>
                )) || <p>Ha ocurrido un error, inténtalo de nuevo más tarde</p>}
            </div>
        );
        setState(true);
    };

    const handleSend = (event?: FormEvent) => {
        event?.preventDefault();
        if (!canSend) return;

        if (file) {
            media.send({
                conversationId,
                file,
                caption: noCaption ? '' : text.trim(),
                asDocument: attachment.asDocument,
            });
            attachment.clear();
            // El audio no lleva texto: lo escrito se queda para después.
            if (!noCaption) setText("");
            return;
        }

        const message = text;
        setText("");
        sendText.mutate({ conversationId, message, temporalId: crypto.randomUUID() }, { onError: showTextError });
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            handleSend();
        }
    };

    // Ctrl+V con una captura: se pega como archivo, y lo escrito pasa a acompañarla.
    const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
        const files = Array.from(event.clipboardData.files);
        if (files.length === 0) return;
        event.preventDefault();
        attachment.attach(files.map(namePasted));
    };

    const handleDrop = (event: DragEvent) => {
        event.preventDefault();
        attachment.attach(Array.from(event.dataTransfer.files));
        textareaRef.current?.focus();
    };

    const hasDraft = Boolean(file || text.trim());

    return (
        <>
            {dragging && (
                <div onDrop={handleDrop}
                    className="absolute inset-3 md:inset-[18px] z-30 rounded-xl border-2 border-dashed border-brand-success bg-brand-green-50
                        flex flex-col items-center justify-center gap-2 p-6 text-center">
                    <span className="w-14 h-14 rounded-xl bg-brand-deep text-brand-accent flex items-center justify-center mb-1.5">
                        <Download size={24} />
                    </span>
                    <span className="max-w-full text-[19px] font-bold tracking-[-0.015em] text-brand-text break-words">Suelta para enviar a {title}</span>
                    <span className="max-w-[380px] text-sm leading-[1.6] text-brand-strong">
                        Un archivo por envío. Fotos JPG o PNG hasta 5 MB; video, audio y documentos hasta 16 MB.
                    </span>
                </div>
            )}

            <div className="bg-brand-surface border-t border-brand-border px-4 md:px-6 py-3.5 flex-none grid gap-3">
                {windowBlocked ? (
                    <>
                        {file && <AttachmentPreview attachment={attachment} onChange={picker.open} disabled withText={Boolean(text.trim())} />}
                        <WindowClosedNotice hasWindow={hasWindow} interrupted={hasDraft} title={title}
                            onSendTemplate={() => setTemplateDialogOpen(true)} />
                    </>
                ) : (
                    <>
                        {endingSoon && (
                            <Callout tone="warning" icon={<Clock size={16} />}>
                                La ventana de 24 h cierra en{" "}
                                <span className="font-mono tabular-nums font-semibold text-brand-warning">
                                    {formatRemaining(msRemaining)}
                                </span>
                                . Después solo podrás escribirle con una plantilla.
                            </Callout>
                        )}
                        {attachment.totalDropped > 1 && (
                            <Callout tone="info" icon={<Info size={16} />} action={
                                <button type="button" onClick={attachment.dismissDropped} title="Entendido"
                                    className="flex text-brand-muted hover:text-brand-text cursor-pointer"><X size={16} /></button>
                            }>
                                <span className="font-semibold text-brand-text">Soltaste {attachment.totalDropped} archivos. Se envían de uno en uno.</span>{' '}
                                Preparamos el primero; cuando lo envíes, adjunta el siguiente.
                            </Callout>
                        )}
                        <AttachmentPreview attachment={attachment} onChange={picker.open} />

                        <form onSubmit={handleSend} className="flex gap-1.5 md:gap-2.5 items-end">
                            <input {...picker.inputProps} accept={OUTBOUND_ACCEPT} />
                            {/* En móvil, con archivo, se ocultan: el texto tiene que caber sobre el teclado. */}
                            <div className={`${file ? 'hidden md:flex' : 'flex'} gap-0.5 md:gap-1`}>
                                <ComposerIconButton title="Adjuntar un archivo" active={Boolean(file)} onClick={picker.open}>
                                    <Paperclip size={20} />
                                </ComposerIconButton>
                                <ComposerIconButton title="Enviar plantilla" onClick={() => setTemplateDialogOpen(true)}>
                                    <LayoutTemplate size={20} />
                                </ComposerIconButton>
                            </div>
                            <textarea
                                ref={textareaRef}
                                value={noCaption ? '' : text}
                                onChange={e => setText(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onPaste={handlePaste}
                                disabled={noCaption}
                                maxLength={file ? CAPTION_MAX : undefined}
                                rows={1}
                                placeholder={noCaption ? 'Los audios se envían sin texto' : file ? 'Añade un texto (opcional)' : 'Escribe un mensaje…'}
                                style={{ lineHeight: "21px" }}
                                className="flex-1 min-w-0 resize-none text-sm text-brand-text bg-brand-bg
                                    border border-brand-border rounded-[10px] px-3.5 py-3
                                    placeholder:text-brand-subtle disabled:placeholder:italic disabled:cursor-not-allowed
                                    focus:outline-none focus:bg-brand-surface focus:border-brand-success
                                    focus:ring-[3px] focus:ring-brand-accent-soft transition-colors"
                            />
                            <button
                                type="submit"
                                title="Enviar"
                                disabled={!canSend}
                                className="w-11 h-11 rounded-[10px] bg-brand-accent hover:bg-brand-accent-hover
                                    disabled:bg-brand-raised disabled:cursor-not-allowed
                                    flex items-center justify-center flex-none cursor-pointer transition-colors"
                            >
                                <SendHorizonal size={18} strokeWidth={2.2} className={canSend ? "text-brand-ink" : "text-brand-subtle"} />
                            </button>
                        </form>
                    </>
                )}
            </div>

            {conversation && (
                <SendTemplateDialog
                    open={templateDialogOpen}
                    onClose={() => setTemplateDialogOpen(false)}
                    conversationId={conversationId}
                    contactName={title}
                    windowOpen={isOpen}
                    keepsDraft={hasDraft}
                />
            )}
        </>
    );
};

const ComposerIconButton = ({ title, active = false, onClick, children }: {
    title: string;
    active?: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) => (
    <button
        type="button"
        onClick={onClick}
        title={title}
        className={`w-11 h-11 rounded-[10px] flex items-center justify-center flex-none transition-colors cursor-pointer
            ${active ? 'bg-brand-accent-soft text-brand-accent-strong' : 'text-brand-gray-600 hover:bg-brand-bg hover:text-brand-text'}`}
    >
        {children}
    </button>
);

/**
 * La ventana está cerrada: solo plantillas. Si se cerró mientras se preparaba
 * un envío (`interrupted`), se dice que lo escrito y el archivo siguen ahí.
 */
const WindowClosedNotice = ({ hasWindow, interrupted, title, onSendTemplate }: {
    hasWindow: boolean;
    interrupted: boolean;
    title: string;
    onSendTemplate: () => void;
}) => {
    const action = <CustomButton onClick={onSendTemplate}>Enviar plantilla</CustomButton>;

    if (interrupted) {
        return (
            <Callout tone="warning" icon={<Clock size={16} />} title="La ventana se cerró mientras preparabas el envío." action={action}>
                Lo que preparaste sigue aquí; ahora solo puedes mandar una plantilla.
            </Callout>
        );
    }
    return (
        <Callout tone="info" icon={hasWindow ? <LayoutTemplate size={16} /> : <Clock size={16} />}
            title={hasWindow ? "La ventana de 24 h se cerró" : "Esperando respuesta"} action={action}>
            {hasWindow
                ? "Pasaron más de 24 h desde su último mensaje. WhatsApp solo permite retomar la conversación con una plantilla aprobada."
                : `Cuando ${title} conteste, se abre la ventana de 24 h y podrás escribir libremente. Mientras tanto, solo plantillas.`}
        </Callout>
    );
};
