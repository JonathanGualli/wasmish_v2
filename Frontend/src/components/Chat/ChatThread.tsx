import { useEffect, useMemo } from "react";
import { useInView } from "react-intersection-observer";
import { Transition } from "@headlessui/react";
import { CircleAlert } from "lucide-react";
import { useConversationMessages } from "../../hooks/useConversationMessages";
import { useConversations } from "../../hooks/useConversations.ts";
import { useTemplates } from "../../hooks/useTemplates.ts";
import { renderLegacyTemplateText } from "../../utils/legacyTemplate.ts";
import { MessageTypeIcon } from "./MessageTypeIcon.tsx";
import { MessageMedia } from "./MessageMedia.tsx";
import { formatDayLabel, dayKey } from "../../utils/formatChatTime.ts";
import type { Message, MessageStatus } from "../../models/message.mode.ts";
import { TemplateButtons } from "./TemplatePreview.tsx";
import type { Template } from "../../models/template.model.ts";
import { whatsappErrorLabel, whatsappErrorText } from "../../utils/whatsappErrors";
import { ChatHeader } from "./ChatHeader.tsx";
import { ContactSidebar } from "./ContactSidebar/ContactSidebar.tsx";
import { ChatComposer } from "./Composer/ChatComposer.tsx";
import { MessageUploadStatus } from "./MessageUploadStatus.tsx";
import { showsUploadStatus, uploadPercent } from "../../utils/outboundMedia.ts";
import { ProgressBar } from "../ProgressBar/ProgressBar.tsx";

interface Props {
    conversationId: string | null;
    /** Volver a la bandeja en móvil, donde lista e hilo no caben a la vez. */
    onBack?: () => void;
    /** La ficha del contacto: la decide `ChatPage` (se cierra al cambiar de conversación). */
    contactSidebarOpen: boolean;
    onContactSidebarChange: (open: boolean) => void;
}

const CenteredMessage = ({ children }: { children: React.ReactNode }) => (
    <div className="flex-1 flex items-center justify-center text-brand-muted p-4 text-center text-sm">
        {children}
    </div>
);

/** El acuse va en palabras, como en la maqueta — no en dobles checks. */
const STATUS_LABEL: Record<MessageStatus, string> = {
    sent: "Enviado",
    delivered: "Entregado",
    read: "Leído",
    failed: "Fallido",
};

const formatTime = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
        ? ""
        : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

/**
 * Tooltip del mensaje fallido: el motivo en palabras y, debajo, el código y el
 * texto original de Meta (por si hay que buscarlo o pasárselo a soporte). Sin
 * código, el error es nuestro (de antes de llamar a Meta) y ya viene en español.
 */
const FailedBadge = ({ msg }: { msg: Message }) => (
    <span className="relative group inline-flex items-center gap-1 text-brand-danger font-semibold cursor-pointer">
        <CircleAlert className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />
        Fallido
        <span className="absolute bottom-full right-0 mb-3 hidden group-hover:flex flex-col z-50
            w-[300px] px-5 py-4 rounded-2xl text-left font-normal whitespace-normal
            bg-brand-surface text-brand-text border border-brand-border shadow-[0_18px_40px_rgba(14,17,22,0.12)]">
            <span className="absolute -bottom-2 right-6 w-4 h-4 bg-brand-surface
                border-r border-b border-brand-border rotate-45" />
            <span className="font-bold text-[15px] text-brand-danger">
                {msg.errorCode ? 'WhatsApp no entregó el mensaje' : 'No se pudo enviar'}
            </span>
            <span className="mt-1 text-brand-strong text-[13px] leading-relaxed">
                {whatsappErrorText(msg.errorCode, msg.errorDetail)}
            </span>
            {msg.errorCode && (
                <span className="mt-2 text-brand-muted text-xs leading-relaxed">
                    <span className="font-mono">Código {msg.errorCode}</span>
                    {whatsappErrorLabel(msg.errorCode) && msg.errorDetail && <> · {msg.errorDetail}</>}
                </span>
            )}
        </span>
    </span>
);

export const ChatThread = ({ conversationId, onBack, contactSidebarOpen, onContactSidebarChange }: Props) => {
    const { data: messages, isLoading, isError, fetchNextPage, hasNextPage } =
        useConversationMessages(conversationId || "");
    const { data: conversations } = useConversations();
    const { templates } = useTemplates();
    const { ref, inView } = useInView();

    const conversation = useMemo(
        () => conversations?.find(c => c.id === conversationId),
        [conversations, conversationId]
    );

    useEffect(() => {
        if (inView && hasNextPage) void fetchNextPage();
    }, [inView, hasNextPage, fetchNextPage]);

    const renderContent = () => {
        if (!conversationId) return <CenteredMessage>Selecciona una conversación</CenteredMessage>;
        if (isLoading) return <CenteredMessage>Cargando mensajes…</CenteredMessage>;
        if (isError) return <CenteredMessage>¡Error al cargar los mensajes!</CenteredMessage>;
        if (!messages || messages.length === 0) return <CenteredMessage>No hay mensajes todavía.</CenteredMessage>;

        // `messages` viene del más nuevo al más viejo y el lienzo va en
        // flex-col-reverse. El separador de día se inserta DESPUÉS del último
        // mensaje de cada día para que, ya invertido, quede encima del grupo.
        const nodes: React.ReactNode[] = [];

        messages.forEach((msg: Message, i: number) => {
            const mine = msg.sender === "me";
            // Adjuntos, ubicaciones, respuestas a botones… El texto ya viene
            // resuelto del backend (el caption, o una etiqueta); aquí solo se
            // le pone delante el icono que dice de qué se trata.
            const esAdjunto = Boolean(msg.type) && msg.type !== "text";
            // Con archivo se pinta el archivo y, debajo, solo lo que el contacto
            // escribió de verdad: poner «Imagen» bajo una imagen que ya se ve
            // sobra. Sin archivo (descarga fallida, o tipo sin nada que bajar)
            // se cae a la etiqueta con su icono, que es como estaba antes.
            const conArchivo = Boolean(msg.hasMedia || msg.pending);
            // Enviado como plantilla: se nombra encima y se pintan sus botones
            // debajo, como los ve el contacto. Los botones salen de la definición
            // sincronizada; si la plantilla ya no está, solo queda el nombre.
            const plantilla = msg.templateName
                ? (templates as Template[]).find(t => t.name === msg.templateName)
                : undefined;

            nodes.push(
                <div
                    // Por `temporalId` primero: el optimista y el que vuelve del
                    // servidor son el mismo, y la imagen no se vuelve a montar.
                    key={msg.temporalId ?? msg.id ?? i}
                    className={`max-w-[85%] md:max-w-[62%] ${mine ? "self-end" : "self-start"}`}
                >
                    {msg.templateName && (
                        <div className={`font-mono text-[11px] text-brand-subtle mb-1 ${mine ? "text-right" : ""}`}>
                            Plantilla · {msg.templateName}
                        </div>
                    )}
                    <div
                        className={`px-3.5 py-2.5 text-sm leading-[1.5] whitespace-pre-line
                            ${mine
                                ? "bg-brand-deep text-white rounded-[12px_12px_3px_12px]"
                                : "bg-brand-surface text-brand-text border border-brand-border rounded-[12px_12px_12px_3px]"}`}
                    >
                        {conArchivo ? (
                            <span className="flex flex-col gap-2">
                                <MessageMedia msg={msg} />
                                {msg.pending && msg.status !== "failed" && (
                                    <ProgressBar percent={uploadPercent(msg.pending)} active />
                                )}
                                {/* Una plantilla con archivo en la cabecera: debajo va su cuerpo. */}
                                {msg.templateName
                                    ? <span className="min-w-0">{renderLegacyTemplateText(msg.text, templates)}</span>
                                    : msg.caption && <span className="min-w-0">{msg.caption}</span>}
                            </span>
                        ) : esAdjunto ? (
                            <span className="flex items-start gap-2">
                                <span className={`mt-[3px] ${mine ? "text-brand-on-deep-muted" : "text-brand-muted"}`}>
                                    <MessageTypeIcon type={msg.type} />
                                </span>
                                <span className="min-w-0">{msg.text}</span>
                            </span>
                        ) : (
                            renderLegacyTemplateText(msg.text, templates)
                        )}
                    </div>
                    <TemplateButtons buttons={plantilla?.buttons} />

                    <div className={`flex items-center gap-[5px] text-[11px] mt-1 text-brand-subtle
                        ${mine ? "justify-end" : ""}`}>
                        <span className="font-mono">{formatTime(msg.timestamp)}</span>
                        {mine && (
                            showsUploadStatus(msg)
                                ? <MessageUploadStatus msg={msg} />
                                : msg.status === "failed"
                                ? <FailedBadge msg={msg} />
                                : <span className={msg.status === "read" ? "text-brand-success font-semibold" : ""}>
                                    {STATUS_LABEL[msg.status]}
                                </span>
                        )}
                    </div>
                </div>
            );

            const next = messages[i + 1];
            if (!next || dayKey(next.timestamp) !== dayKey(msg.timestamp)) {
                nodes.push(
                    <div
                        key={`day-${dayKey(msg.timestamp)}`}
                        className="self-center text-[10px] font-bold uppercase tracking-[0.08em]
                            text-brand-muted bg-brand-border rounded-full px-[13px] py-[5px]"
                    >
                        {formatDayLabel(msg.timestamp)}
                    </div>
                );
            }
        });

        // Al final del array = arriba del todo: dispara la carga de más antiguos.
        nodes.push(<div key="infinite-scroll-trigger" ref={ref} />);
        return nodes;
    };

    const title = conversation?.title || conversation?.phone || "";
    // Una conversación anterior a los contactos sin enlazar no tiene ficha.
    const contactId = conversation?.contactId;
    const sidebarOpen = contactSidebarOpen && Boolean(contactId);

    return (
        <div className="relative h-full w-full flex min-h-0">
            {/* `relative`: el aviso de soltar un archivo cubre toda la conversación. */}
            <div className="relative bg-brand-bg flex-1 min-w-0 flex flex-col min-h-0">
                {conversationId && conversation && (
                    <ChatHeader
                        conversation={conversation}
                        onBack={onBack}
                        contactSidebarOpen={sidebarOpen}
                        onToggleContactSidebar={() => onContactSidebarChange(!sidebarOpen)}
                    />
                )}

                {/* Lienzo */}
                <div className="flex-1 overflow-y-auto min-h-0 px-6 py-[22px] flex flex-col-reverse gap-3">
                    {renderContent()}
                </div>

                {conversationId && (
                    <ChatComposer key={conversationId} conversationId={conversationId} conversation={conversation} title={title} />
                )}
            </div>

            {contactId && conversation && (
                // Por conversación (`key`): al cambiar de chat se va sin animar,
                // en vez de salir deslizándose con el contacto del chat nuevo.
                <Transition key={conversation.id} show={sidebarOpen}>
                    {/* Desde 1280 px, una columna junto al chat que se abre a lo
                        ancho y lo va estrechando. Por debajo no caben bandeja, chat
                        y ficha: entra desde la derecha sobre la conversación. En
                        móvil, a pantalla completa. */}
                    <div className="absolute inset-0 z-20 md:left-auto md:w-[340px] md:shadow-[-24px_0_48px_rgba(14,17,22,0.10)]
                        xl:static xl:flex-none xl:overflow-hidden xl:shadow-none xl:border-l xl:border-brand-border
                        transition-[translate,width] duration-200 ease-out data-[leave]:duration-150 data-[leave]:ease-in
                        data-[closed]:translate-x-full xl:data-[closed]:translate-x-0 xl:data-[closed]:w-0">
                        <div className="h-full w-full md:w-[340px]">
                            <ContactSidebar
                                contactId={contactId}
                                conversationId={conversation.id}
                                windowExpiresAt={conversation.windowExpiresAt}
                                onClose={() => onContactSidebarChange(false)}
                            />
                        </div>
                    </div>
                </Transition>
            )}
        </div>
    );
};
