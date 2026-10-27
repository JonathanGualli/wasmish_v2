import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";
import { Transition } from "@headlessui/react";
import { Ban, Bot, CircleAlert, Code2, File as FileIcon, LoaderCircle, Send, Smartphone } from "lucide-react";
import { useConversationMessages } from "../../hooks/useConversationMessages";
import { useConversations } from "../../hooks/useConversations.ts";
import { useTemplates } from "../../hooks/useTemplates.ts";
import { renderLegacyTemplateText } from "../../utils/legacyTemplate.ts";
import { MessageTypeIcon } from "./MessageTypeIcon.tsx";
import { MessageMedia } from "./MessageMedia.tsx";
import { MessageChangeDetails, MessageChangeToggle } from "./MessageChange.tsx";
import { formatDayLabel, dayKey } from "../../utils/formatChatTime.ts";
import type { Message, MessageQuote, MessageStatus } from "../../models/message.mode.ts";
import { TemplateButtons } from "./TemplatePreview.tsx";
import type { Template } from "../../models/template.model.ts";
import type { NewConversationRequest } from "../../models/conversation.mode.ts";
import { whatsappErrorLabel, whatsappErrorText } from "../../utils/whatsappErrors";
import { ChatHeader } from "./ChatHeader.tsx";
import { ThreadSkeleton } from "./ChatSkeletons.tsx";
import { ContactSidebar } from "./ContactSidebar/ContactSidebar.tsx";
import { ChatComposer } from "./Composer/ChatComposer.tsx";
import { MessageUploadStatus } from "./MessageUploadStatus.tsx";
import { useAuthContext } from "../../context/auth.context";
import { useNoticeContext } from "../Notice/context/UseNoticeContext";
import type { AxiosError } from "axios";
import { hasTeam } from "../../utils/roleDisplay";
import { showsUploadStatus, uploadPercent } from "../../utils/outboundMedia.ts";
import { ProgressBar } from "../ProgressBar/ProgressBar.tsx";
import { useMessageReaction } from "../../hooks/useMessageReaction";
import { useJumpToMessage } from "../../hooks/useJumpToMessage";
import { PHONE_QUERY, useMediaQuery } from "../../hooks/useMediaQuery";
import { QuotedMessage } from "./Message/QuotedMessage";
import { ForwardedLabel } from "./Message/ForwardedLabel";
import { MessageReactions } from "./Message/MessageReactions";
import { HoverActions, MessageMenu, type MenuAnchor } from "./Message/MessageActions";
import { currentOwnEmoji } from "../../utils/messageActions";
import { quoteFromMessage } from "../../utils/messageQuote";
import { isHistoryPlaceholder } from "../../utils/historyPlaceholder";

// El selector completo: él y sus datos solo se cargan al abrirlo.
const EmojiPicker = lazy(() => import("./Emoji/EmojiPicker"));

/** Mantener pulsado un mensaje en el celular abre su menú (diseño, m2). */
const LONG_PRESS_MS = 450;
/** Lo que dura un aviso dentro del hilo. */
const TOAST_MS = 3200;

interface Props {
    conversationId: string | null;
    /** Volver a la bandeja en móvil, donde lista e hilo no caben a la vez. */
    onBack?: () => void;
    /** La ficha del contacto: la decide `ChatPage` (se cierra al cambiar de conversación). */
    contactSidebarOpen: boolean;
    onContactSidebarChange: (open: boolean) => void;
    /** Escribirle desde otra línea (la suya se desconectó): la conversación nueva con el contacto ya puesto. */
    onStartConversation: (request: NewConversationRequest) => void;
    /** Abrir otra conversación del mismo contacto, desde su ficha (la de otra línea). */
    onOpenConversation: (conversationId: string) => void;
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
                <span className="mt-2 text-brand-muted text-xs leading-relaxed [overflow-wrap:anywhere]">
                    <span className="font-mono">Código {msg.errorCode}</span>
                    {whatsappErrorLabel(msg.errorCode) && msg.errorDetail && <> · {msg.errorDetail}</>}
                </span>
            )}
        </span>
    </span>
);

/**
 * Quién envió un mensaje nuestro (Fase 3; diseño «Wasmish Equipo», marco 5a):
 * el nombre de la persona, o el origen en gris con icono si no lo escribió nadie
 * (una campaña, la API, las respuestas automáticas). En la línea de la hora, no
 * dentro de la burbuja.
 */
const MessageAuthor = ({ msg }: { msg: Message }) => {
    if (msg.sentBy?.name) {
        return <><span className="font-semibold text-brand-strong">{msg.sentBy.name}</span><span>·</span></>;
    }
    if (msg.origin?.kind === 'bot') {
        return (
            <>
                <span className="inline-flex items-center gap-1 text-brand-muted"><Bot size={11} />Bot</span>
                <span>·</span>
            </>
        );
    }
    // Respondido desde la app de WhatsApp Business (coexistencia): en el celular o
    // en un dispositivo vinculado. Sin persona: Meta no dice quién lo escribió.
    if (msg.origin?.kind === 'businessApp') {
        return (
            <>
                <span className="inline-flex items-center gap-1 text-brand-muted"><Smartphone size={11} />Desde la app de WhatsApp</span>
                <span>·</span>
            </>
        );
    }
    if (msg.origin?.kind === 'campaign' || msg.origin?.kind === 'api') {
        const isCampaign = msg.origin.kind === 'campaign';
        const label = msg.origin.kind === 'campaign'
            ? (msg.origin.campaignName ? `Campaña «${msg.origin.campaignName}»` : 'Campaña')
            : 'API';
        return (
            <>
                <span className="inline-flex items-center gap-1 text-brand-muted">
                    {isCampaign ? <Send size={11} /> : <Code2 size={11} />}{label}
                </span>
                <span>·</span>
            </>
        );
    }
    return null;
};

export const ChatThread = ({
    conversationId, onBack, contactSidebarOpen, onContactSidebarChange, onStartConversation, onOpenConversation,
}: Props) => {
    const { data: messages, isLoading, isError, error, fetchNextPage, hasNextPage } =
        useConversationMessages(conversationId || "");
    const { setState: showNotice, setContent: setNoticeContent } = useNoticeContext();

    // La conversación dejó de existir para esta sesión: le quitaron su línea con
    // el chat abierto (Fase 3, `access_changed`; revisión de Codex del PR #37).
    // Un 404 cierra el chat con un aviso, en vez de quedarse en el error.
    const lostAccess = isError && (error as AxiosError | null)?.response?.status === 404;
    useEffect(() => {
        if (!lostAccess) return;
        setNoticeContent(<p className="text-sm text-brand-strong">Ya no tienes acceso a esta conversación.</p>);
        showNotice(true);
        onBack?.();
    }, [lostAccess, onBack, setNoticeContent, showNotice]);
    const { data: conversations } = useConversations();
    const { templates } = useTemplates();
    const { ref, inView } = useInView();
    // Con una sola persona en la cuenta, la línea de la hora queda como siempre.
    const showAuthor = hasTeam(useAuthContext().user);
    const phone = useMediaQuery(PHONE_QUERY);

    // Citas y reacciones (diseño «Wasmish Chat - Citas y reacciones»).
    const [replyTo, setReplyTo] = useState<Message | null>(null);
    const cancelReply = useCallback(() => setReplyTo(null), []);
    // El menú de un mensaje: la barra de reacciones (y en el celular, Responder).
    const [menu, setMenu] = useState<{ id: string; below: boolean; anchor: MenuAnchor } | null>(null);
    const menuId = menu?.id ?? null;
    const [pickerFor, setPickerFor] = useState<Message | null>(null);
    // Los avisos dentro del hilo (el diseño): una reacción rechazada, una cita demasiado vieja.
    const [toast, setToast] = useState<{ title: string; detail: string } | null>(null);
    // Cambiar de conversación descarta todo eso, como el borrador del
    // composer: volver no trae de vuelta una cita a medias (revisión de Codex
    // del PR #117). Durante el render, como recomienda React, para no pintar
    // ni un fotograma con lo del otro chat.
    const [shownConversation, setShownConversation] = useState(conversationId);
    if (shownConversation !== conversationId) {
        setShownConversation(conversationId);
        setReplyTo(null);
        setMenu(null);
        setPickerFor(null);
        setToast(null);
    }
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const showToast = useCallback((title: string, detail: string) => {
        setToast({ title, detail });
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
    }, []);
    useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

    const { react } = useMessageReaction(conversationId || "", useCallback(
        (reason: string) => showToast("No se pudo reaccionar.", `${reason} El mensaje quedó como estaba.`), [showToast]));
    const jump = useJumpToMessage(conversationId || "", {
        fetchNextPage,
        onTooOld: useCallback(() => showToast("Este mensaje es muy antiguo.", "Wasmish no puede ir hasta él."), [showToast]),
    });

    const scrollerRef = useRef<HTMLDivElement>(null);
    const closeMenus = useCallback(() => { setMenu(null); setPickerFor(null); }, []);
    // Escape cierra lo de dentro antes que la conversación (que la cierra
    // `ChatPage`, también con Escape): primero la barra o el selector, luego la
    // cita. En captura y frenado, para que no llegue a cerrar el chat. Con un
    // diálogo abierto (enviar plantilla), el Escape es suyo.
    useEffect(() => {
        if (!menuId && !pickerFor && !replyTo) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || document.querySelector('[aria-modal="true"]')) return;
            event.stopPropagation();
            if (menuId || pickerFor) closeMenus();
            else cancelReply();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [menuId, pickerFor, replyTo, closeMenus, cancelReply]);

    // Abrir el menú de un mensaje: la barra va encima, salvo que arriba no quepa.
    const openMenu = (msg: Message, anchor: HTMLElement) => {
        if (!conversationId) return;
        const rect = anchor.getBoundingClientRect();
        const top = rect.top - (scrollerRef.current?.getBoundingClientRect().top ?? 0);
        setPickerFor(null);
        setMenu({
            id: msg.id, below: top < 64,
            anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
        });
    };
    const startReply = (msg: Message) => {
        closeMenus();
        setReplyTo(msg);
    };
    const reactTo = (msg: Message, emoji: string) => {
        closeMenus();
        react(msg, emoji);
    };

    // Mantener pulsado en el celular. Tocar sigue haciendo lo de siempre (abrir
    // una foto, el ojo de un eliminado): el toque que termina una pulsación larga se anula.
    const press = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({ timer: null, fired: false });
    const pressHandlers = (msg: Message) => (phone && (msg.canReact || msg.canReply)) ? {
        onTouchStart: (event: React.TouchEvent<HTMLElement>) => {
            const anchor = event.currentTarget;
            press.current.fired = false;
            press.current.timer = setTimeout(() => {
                press.current.fired = true;
                navigator.vibrate?.(10);
                openMenu(msg, anchor);
            }, LONG_PRESS_MS);
        },
        onTouchMove: () => { if (press.current.timer) clearTimeout(press.current.timer); },
        onTouchEnd: () => { if (press.current.timer) clearTimeout(press.current.timer); },
        onClickCapture: (event: React.MouseEvent) => {
            if (!press.current.fired) return;
            press.current.fired = false;
            event.preventDefault();
            event.stopPropagation();
        },
        onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
    } : {};

    const conversation = useMemo(
        () => conversations?.find(c => c.id === conversationId),
        [conversations, conversationId]
    );

    // La cita se pinta desde el original si está cargado: así sigue sus
    // ediciones y su eliminación por el SSE. La que trae el mensaje (de cuando
    // se sirvió) queda para el original que no está en pantalla (spec § 6;
    // revisión de Codex del PR #117).
    const loadedById = useMemo(() => new Map((messages ?? []).map(msg => [msg.id, msg])), [messages]);
    const quoteOf = (msg: Message): MessageQuote | null => {
        const original = msg.replyTo?.id ? loadedById.get(msg.replyTo.id) : undefined;
        return original ? quoteFromMessage(original) : msg.replyTo ?? null;
    };

    useEffect(() => {
        if (inView && hasNextPage) void fetchNextPage();
    }, [inView, hasNextPage, fetchNextPage]);

    // Los mensajes eliminados o editados con el ojo abierto. De esta pantalla:
    // no se guarda ni se comparte entre pestañas.
    const [revealed, setRevealed] = useState<ReadonlySet<string>>(() => new Set());
    const toggleRevealed = (id: string) => setRevealed(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    // El cuerpo de un mensaje: el archivo, un adjunto con su icono o el texto. Lo
    // usan la burbuja y lo que enseña el ojo de un mensaje eliminado (`onDeep`:
    // sobre la burbuja propia, en verde profundo).
    const renderBody = (msg: Message, onDeep: boolean) => {
        // Un archivo de los chats traídos de la app que no llegó: lo dice, sin
        // icono de tipo (Meta no dice qué era).
        if (isHistoryPlaceholder(msg)) {
            return (
                <span className="flex items-center gap-2">
                    <FileIcon size={15} className="flex-none" />
                    <span className="min-w-0">{msg.text}</span>
                </span>
            );
        }
        // Adjuntos, ubicaciones, respuestas a botones… El texto ya viene
        // resuelto del backend (el caption, o una etiqueta); aquí solo se
        // le pone delante el icono que dice de qué se trata.
        const esAdjunto = Boolean(msg.type) && msg.type !== "text";
        // Con archivo se pinta el archivo y, debajo, solo lo que el contacto
        // escribió de verdad: poner «Imagen» bajo una imagen que ya se ve
        // sobra. Sin archivo (descarga fallida, o tipo sin nada que bajar)
        // se cae a la etiqueta con su icono, que es como estaba antes.
        const conArchivo = Boolean(msg.hasMedia || msg.pending);

        if (conArchivo) {
            return (
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
            );
        }
        if (esAdjunto) {
            return (
                <span className="flex items-start gap-2">
                    <span className={`mt-[3px] ${onDeep ? "text-brand-on-deep-muted" : "text-brand-muted"}`}>
                        <MessageTypeIcon type={msg.type} />
                    </span>
                    <span className="min-w-0">{msg.text}</span>
                </span>
            );
        }
        return renderLegacyTemplateText(msg.text, templates);
    };

    const renderContent = () => {
        if (!conversationId) return <CenteredMessage>Selecciona una conversación</CenteredMessage>;
        if (isLoading) return <ThreadSkeleton />;
        if (isError) return <CenteredMessage>¡Error al cargar los mensajes!</CenteredMessage>;
        if (!messages || messages.length === 0) return <CenteredMessage>No hay mensajes todavía.</CenteredMessage>;

        // `messages` viene del más nuevo al más viejo y el lienzo va en
        // flex-col-reverse. El separador de día se inserta DESPUÉS del último
        // mensaje de cada día para que, ya invertido, quede encima del grupo.
        const nodes: React.ReactNode[] = [];

        messages.forEach((msg: Message, i: number) => {
            const mine = msg.sender === "me";
            // Borrado (coexistencia): se dice en su sitio y el ojo enseña lo que decía.
            const deleted = Boolean(msg.deletedAt);
            const changed = deleted || Boolean(msg.editedAt);
            const changeOpen = changed && revealed.has(msg.id);
            // Enviado como plantilla: se nombra encima y se pintan sus botones
            // debajo, como los ve el contacto. Los botones salen de la definición
            // sincronizada; si la plantilla ya no está, solo queda el nombre.
            const plantilla = msg.templateName
                ? (templates as Template[]).find(t => t.name === msg.templateName)
                : undefined;
            const hasReactions = Boolean(msg.reactions?.them || msg.reactions?.me);
            const menuOpen = menuId === msg.id;
            const highlighted = jump.highlightedId === msg.id;
            const quote = quoteOf(msg);
            // Mismo tratamiento en los dos lados: borde punteado, sin el verde de la propia.
            const placeholder = isHistoryPlaceholder(msg) && !deleted;

            nodes.push(
                <div
                    // Por `temporalId` primero: el optimista y el que vuelve del
                    // servidor son el mismo, y la imagen no se vuelve a montar.
                    key={msg.temporalId ?? msg.id ?? i}
                    data-message-id={msg.id}
                    className={`relative group/msg max-w-[85%] md:max-w-[62%] ${mine ? "self-end" : "self-start"}
                        ${menuOpen ? "z-30" : ""}`}
                >
                    {msg.templateName && (
                        <div className={`font-mono text-[11px] text-brand-subtle mb-1 ${mine ? "text-right" : ""}`}>
                            Plantilla · {msg.templateName}
                        </div>
                    )}
                    <div className="relative" {...pressHandlers(msg)}>
                    <div
                        // Con reacciones, la burbuja crece lo justo para sostenerlas
                        // (diseño, «Dónde cuelgan»). El halo menta: el original al que se fue desde una cita.
                        style={hasReactions ? { minWidth: (msg.reactions?.them && msg.reactions?.me ? 2 : 1) * 40 + 30 } : undefined}
                        className={`px-3.5 py-2.5 text-sm max-md:text-[15px] leading-[1.5] whitespace-pre-line [overflow-wrap:anywhere]
                            transition-shadow duration-500 ${hasReactions ? "pb-[22px]" : ""}
                            ${highlighted ? "shadow-[0_0_0_3px_var(--color-brand-accent),0_0_0_9px_var(--color-brand-accent-soft)]" : ""}
                            ${phone && (msg.canReact || msg.canReply) ? "select-none [-webkit-touch-callout:none]" : ""}
                            ${placeholder
                                ? `text-brand-gray-600 border border-dashed border-brand-border-strong
                                    ${mine ? "rounded-[12px_12px_3px_12px]" : "rounded-[12px_12px_12px_3px]"}`
                                : mine
                                ? "bg-brand-deep text-white rounded-[12px_12px_3px_12px]"
                                : "bg-brand-surface text-brand-text border border-brand-border rounded-[12px_12px_12px_3px]"}`}
                    >
                        {msg.forwarded && <ForwardedLabel forwarded={msg.forwarded} onDeep={mine && !placeholder} />}
                        {quote && (
                            <QuotedMessage quote={quote} onDeep={mine && !placeholder} contactName={title} team={showAuthor}
                                onOpen={quote.id ? () => void jump.jumpTo(quote.id!) : undefined} />
                        )}
                        {deleted ? (
                            <span className={`flex items-center gap-1.5 italic ${mine ? "text-brand-on-deep" : "text-brand-muted"}`}>
                                <Ban size={14} className="flex-none" />
                                Mensaje eliminado
                            </span>
                        ) : renderBody(msg, mine && !placeholder)}
                    </div>
                    <MessageReactions msg={msg} mine={mine} phone={phone} onReact={(emoji) => react(msg, emoji)} />
                    {!phone && (
                        <HoverActions msg={msg} mine={mine} barOpen={menuOpen}
                            onToggleBar={() => (menuOpen ? setMenu(null) : openMenu(msg, document.querySelector(`[data-message-id="${CSS.escape(msg.id)}"]`) as HTMLElement))}
                            onReply={() => startReply(msg)} />
                    )}
                    {menuOpen && (
                        <MessageMenu msg={msg} mine={mine} phone={phone} below={menu?.below ?? false} anchor={menu?.anchor ?? null}
                            onReact={(emoji) => reactTo(msg, emoji)}
                            onMore={() => { setMenu(null); setPickerFor(msg); }}
                            onReply={() => startReply(msg)} />
                    )}
                    </div>
                    {!deleted && <TemplateButtons buttons={plantilla?.buttons} />}

                    {/* Cada pieza baja entera si no cabe: en el teléfono, «Desde la app
                        de WhatsApp», «Editado», la hora y el ojo partían la hora en dos. */}
                    <div className={`flex flex-wrap items-center gap-x-[5px] gap-y-0.5 whitespace-nowrap text-[11px] text-brand-subtle
                        ${hasReactions ? "mt-[17px]" : "mt-1"} ${mine ? "justify-end" : ""}`}>
                        {/* «Bot» y «Desde la app de WhatsApp» siempre: sin equipo también hay que saber
                            qué contestó la máquina y qué se respondió desde el celular. */}
                        {mine && (showAuthor || msg.origin?.kind === 'bot' || msg.origin?.kind === 'businessApp') && <MessageAuthor msg={msg} />}
                        {/* Eliminado manda: un eliminado y editado no dice «Editado». */}
                        {msg.editedAt && !deleted && <><span>Editado</span><span>·</span></>}
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
                        {changed && (
                            <MessageChangeToggle msg={msg} open={changeOpen} onToggle={() => toggleRevealed(msg.id)} />
                        )}
                    </div>
                    {changeOpen && (
                        <MessageChangeDetails msg={msg} renderBody={(m) => renderBody(m, false)} />
                    )}
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

                {/* Lienzo, con lo que flota sobre él: buscar el original, los avisos y el selector. */}
                <div className="relative flex-1 min-h-0 flex flex-col">
                    <div ref={scrollerRef}
                        className="flex-1 overflow-y-auto min-h-0 px-6 max-md:px-4 py-[22px] max-md:py-4 flex flex-col-reverse gap-3">
                        {renderContent()}
                    </div>

                    {/* Con la barra o el selector abiertos: tocar fuera los cierra. En el celular, oscurece (m2). */}
                    {(menuId || pickerFor) && (
                        <div onClick={closeMenus} aria-hidden="true"
                            className={`fixed inset-0 z-20 ${phone ? "bg-brand-ink/50" : ""}`} />
                    )}

                    {jump.searching && (
                        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2.5 whitespace-nowrap
                            bg-brand-surface border border-brand-border rounded-full shadow-[0_6px_18px_rgba(14,17,22,0.12)]
                            py-[7px] pr-2 pl-3.5 text-[13px] font-semibold text-brand-strong">
                            <LoaderCircle size={14} strokeWidth={2.8} className="text-brand-accent-strong motion-safe:animate-spin" />
                            Buscando el mensaje en el historial…
                            <button type="button" onClick={jump.cancel}
                                className="h-[26px] px-2.5 rounded-full text-[12.5px] text-brand-gray-600 hover:bg-brand-bg cursor-pointer">
                                Cancelar
                            </button>
                        </div>
                    )}

                    {toast && (
                        <div role="status"
                            className="absolute bottom-3.5 left-1/2 -translate-x-1/2 z-10 w-max max-w-[86%] bg-brand-text text-white rounded-[10px]
                                shadow-[0_10px_28px_rgba(14,17,22,0.25)] px-3.5 py-2.5 text-[13.5px] leading-[1.45]">
                            <span className="font-semibold">{toast.title}</span>{" "}
                            <span className="text-brand-border-strong">{toast.detail}</span>
                        </div>
                    )}

                    {pickerFor && (
                        <div className={phone ? "fixed inset-x-0 bottom-0 z-40" : "absolute right-4 bottom-3 z-40"}>
                            <Suspense fallback={null}>
                                <EmojiPicker mobile={phone}
                                    target={pickerFor.text.length > 60 ? `${pickerFor.text.slice(0, 60)}…` : pickerFor.text}
                                    current={currentOwnEmoji(pickerFor)}
                                    onPick={(emoji) => reactTo(pickerFor, emoji)}
                                    onClose={() => setPickerFor(null)} />
                            </Suspense>
                        </div>
                    )}
                </div>

                {conversationId && (
                    <ChatComposer key={conversationId} conversationId={conversationId} conversation={conversation} title={title}
                        onStartConversation={onStartConversation}
                        replyTo={replyTo} onCancelReply={cancelReply} team={showAuthor} />
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
                                onOpenConversation={onOpenConversation}
                                onClose={() => onContactSidebarChange(false)}
                            />
                        </div>
                    </div>
                </Transition>
            )}
        </div>
    );
};
