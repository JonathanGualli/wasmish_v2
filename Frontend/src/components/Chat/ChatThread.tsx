import { useEffect, useMemo, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";
import { ChevronLeft, CircleAlert, SendHorizonal } from "lucide-react";
import type { AxiosError } from "axios";
import { useConversationMessages } from "../../hooks/useConversationMessages";
import { useConversationSendMessages } from "../../hooks/useConversationSendMessages.ts";
import { useConversations } from "../../hooks/useConversations.ts";
import { useTemplates } from "../../hooks/useTemplates.ts";
import { useModalContext } from "../Modal/context/UseModalContext.ts";
import { renderLegacyTemplateText } from "../../utils/legacyTemplate.ts";
import { formatDayLabel, dayKey } from "../../utils/formatChatTime.ts";
import { initials } from "../../utils/initials.ts";
import type { Message, MessageStatus } from "../../models/message.mode.ts";

interface Props {
    conversationId: string | null;
    /** Volver a la bandeja en móvil, donde lista e hilo no caben a la vez. */
    onBack?: () => void;
}

interface ErrorItem {
    message: string;
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

/** Tooltip del mensaje fallido con el error que devolvió Meta. */
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
                WhatsApp (Meta) respondió con el siguiente error:
            </span>
            <span className="mt-1 text-brand-muted text-[13px] leading-relaxed">
                <span className="block font-mono text-brand-danger">Error {msg.errorCode || "000"}</span>
                {msg.errorDetail || "Error desconocido"}
            </span>
        </span>
    </span>
);

export const ChatThread = ({ conversationId, onBack }: Props) => {
    const { data: messages, isLoading, isError, fetchNextPage, hasNextPage } =
        useConversationMessages(conversationId || "");
    const { data: conversations } = useConversations();
    const { templates } = useTemplates();
    const sendMessageMutation = useConversationSendMessages();
    const { setState, setContent } = useModalContext();

    const [text, setText] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const { ref, inView } = useInView();

    const conversation = useMemo(
        () => conversations?.find(c => c.id === conversationId),
        [conversations, conversationId]
    );

    useEffect(() => {
        setText("");
        if (conversationId) textareaRef.current?.focus();
    }, [conversationId]);

    useEffect(() => {
        if (inView && hasNextPage) void fetchNextPage();
    }, [inView, hasNextPage, fetchNextPage]);

    // Auto-alto del composer, hasta 6 líneas y luego scroll.
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        const max = 6 * 21;
        el.style.height = `${Math.min(el.scrollHeight, max)}px`;
        el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
    }, [text]);

    const handleSendMessage = (event?: React.FormEvent) => {
        event?.preventDefault();
        if (!text.trim() || !conversationId) return;

        const message = text;
        setText("");

        sendMessageMutation.mutate(
            { conversationId, message, temporalId: crypto.randomUUID() },
            {
                onError: (error: Error) => {
                    setContent(
                        <div className="text-brand-danger text-sm">
                            {(error as AxiosError<ErrorItem[]>).response?.data?.map((err, i) => (
                                <p key={i}>{err.message}</p>
                            )) || <p>Ha ocurrido un error, inténtalo de nuevo más tarde</p>}
                        </div>
                    );
                    setState(true);
                },
            }
        );
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

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

            nodes.push(
                <div
                    key={msg.id ?? msg.temporalId ?? i}
                    className={`max-w-[85%] md:max-w-[62%] ${mine ? "self-end" : "self-start"}`}
                >
                    <div
                        className={`px-3.5 py-2.5 text-sm leading-[1.5] whitespace-pre-line
                            ${mine
                                ? "bg-brand-deep text-white rounded-[12px_12px_3px_12px]"
                                : "bg-brand-surface text-brand-text border border-brand-border rounded-[12px_12px_12px_3px]"}`}
                    >
                        {renderLegacyTemplateText(msg.text, templates)}
                    </div>

                    <div className={`flex items-center gap-[5px] text-[11px] mt-1 text-brand-subtle
                        ${mine ? "justify-end" : ""}`}>
                        <span className="font-mono">{formatTime(msg.timestamp)}</span>
                        {mine && (
                            msg.status === "failed"
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

    return (
        <div className="bg-brand-bg h-full w-full flex flex-col min-h-0">
            {/* Cabecera del contacto */}
            {conversationId && conversation && (
                <div className="bg-brand-surface border-b border-brand-border px-4 md:px-6 py-3.5
                    flex items-center gap-3 flex-none">
                    {onBack && (
                        <button
                            type="button"
                            onClick={onBack}
                            title="Volver a la bandeja"
                            className="md:hidden -ml-1 text-brand-strong hover:text-brand-text
                                transition-colors cursor-pointer flex-none"
                        >
                            <ChevronLeft size={22} strokeWidth={2.2} />
                        </button>
                    )}
                    <div className="w-9 h-9 rounded-[9px] bg-brand-accent-soft text-brand-accent-strong
                        text-xs font-bold flex items-center justify-center flex-none">
                        {initials(title)}
                    </div>
                    <div className="min-w-0">
                        <div className="text-[15px] font-semibold text-brand-text truncate">{title}</div>
                        <div className="font-mono text-[11px] text-brand-muted">+{conversation.phone}</div>
                    </div>
                </div>
            )}

            {/* Lienzo */}
            <div className="flex-1 overflow-y-auto min-h-0 px-6 py-[22px] flex flex-col-reverse gap-3">
                {renderContent()}
            </div>

            {/* Composer */}
            {conversationId && (
                <form
                    onSubmit={handleSendMessage}
                    className="bg-brand-surface border-t border-brand-border px-6 py-3.5 flex-none"
                >
                    <div className="flex gap-2.5 items-end">
                        <textarea
                            ref={textareaRef}
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            rows={1}
                            placeholder="Escribe un mensaje…"
                            style={{ lineHeight: "21px" }}
                            className="flex-1 resize-none text-sm text-brand-text bg-brand-bg
                                border border-brand-border rounded-[10px] px-3.5 py-3
                                placeholder:text-brand-subtle
                                focus:outline-none focus:bg-brand-surface focus:border-brand-success
                                focus:ring-[3px] focus:ring-brand-accent-soft transition-colors"
                        />
                        <button
                            type="submit"
                            title="Enviar"
                            disabled={!text.trim()}
                            className="w-11 h-11 rounded-[10px] bg-brand-accent hover:bg-brand-accent-hover
                                disabled:bg-brand-raised disabled:cursor-not-allowed
                                flex items-center justify-center flex-none cursor-pointer transition-colors"
                        >
                            <SendHorizonal size={18} strokeWidth={2.2}
                                className={text.trim() ? "text-brand-ink" : "text-brand-subtle"} />
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
};
