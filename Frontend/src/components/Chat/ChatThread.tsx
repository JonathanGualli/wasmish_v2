import { useEffect, useMemo, useRef, useState } from "react";
import { useConversationMessages } from "../../hooks/useConversationMessages";
import type { Message } from "../../models/message.mode.ts";
import { CustomButton } from "../Button/Button.tsx";
import { CustomInput } from "../Input/Input.tsx";
import { useConversationSendMessages } from "../../hooks/useConversationSendMessages.ts";
import { useModalContext } from "../Modal/context/UseModalContext.ts";
import type { AxiosError } from "axios";
import { useInView } from "react-intersection-observer";
import { Check, CheckCheck, SendHorizonal, CircleAlert} from "lucide-react";


interface Props {
    conversationId: string | null;
}

interface ErrorItem {
  message: string;
}


// Componente para no repetir código de estados
const CenteredMessage = ({ children }: { children: React.ReactNode }) => (
    <div className="flex-1 flex items-center justify-center text-brand-muted p-4 text-center">
        {children}
    </div>
);

export const ChatThread = ({ conversationId }: Props) => {

    const { data: messages, isLoading, isError, fetchNextPage, hasNextPage} = useConversationMessages(conversationId || "");
    const [text, setText] = useState("");
    const sendMessageMutation = useConversationSendMessages();
    const { setState, setContent } = useModalContext();
    const formRef = useRef<HTMLFormElement | null>(null);
    const { ref, inView } = useInView();

    // Enfoca el campo de mensaje cada vez que se abre/cambia de conversación
    useEffect(() => {
        setText(""); // Limpiar el campo de texto al cambiar de conversación
        if (conversationId) {
            formRef.current?.querySelector("textarea")?.focus();
        }
    }, [conversationId]);

    useEffect(() => {
        if (inView && hasNextPage) {
            void fetchNextPage();
        }
    }, [inView, hasNextPage, fetchNextPage]);

    const formatTime = useMemo(() => (iso?: string) => {
        if (!iso) return "";
        try {
            const d = new Date(iso);
            return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        } catch {
            return "";
        }
    }, []);

    const handleSendMessage = (event: React.FormEvent) => {
        event.preventDefault();
        if (!text.trim() || !conversationId) return;

        // Vaciar el texto a enviar
        setText("");

        sendMessageMutation.mutate({ conversationId: conversationId!, message: text, temporalId: crypto.randomUUID()}, {
            onError: (error: Error) => {
                console.log(error);
                setContent(
                    <div className="text-brand-danger">
                        {(error as AxiosError<ErrorItem[]>).response?.data.map((err, i) => (
                            <p key={i}>{err.message}</p>
                        )) || <p>A ocurrido un error, intentalo de nuevo más tarde</p>}
                    </div>)
                setState(true);
            }
        });
    }

    // 3 - Renderizado condicional basado en el estado de la conversación
    const renderContent = () => {
        if(!conversationId) return <CenteredMessage>Seleccione una conversación</CenteredMessage>;

        if(isLoading) return <CenteredMessage>Cargando mensajes...</CenteredMessage>;

        if(isError) return <CenteredMessage>¡Error al cargar los mensajes!</CenteredMessage>;

        if(!messages || messages.length === 0) return <CenteredMessage>No hay mensajes disponibles.</CenteredMessage>;

        const messageElements = messages.map((msg: Message) => (
            <div
            key={msg.id ?? crypto.randomUUID()}
            className={`flex w-full pt-1 ${msg.sender === "me" ? "justify-end" : "justify-start"}`}>
                <div
                className={`
                p-2 rounded-xl max-w-xs md:max-w-md shadow-sm flex flex-col items-end
                ${msg.sender === "me"
                ? "bg-brand-accent/20 text-brand-text"
                : "bg-brand-raised text-brand-text"}`}>

                    <div className="leading-snug whitespace-pre-line">{msg.text}</div>

                    <div className="flex flex-row gap-1 items-end">

                        <span className="text-[11px] text-brand-subtle">{formatTime(msg.timestamp)}</span>

                        {msg.sender === "me" && (
                            <div className="text-xs flex gap-0.5 items-end">

                                {msg.status === "sent" && (
                                    <Check className="w-4 h-4 text-brand-muted" />
                                )}

                                {msg.status === "delivered" && (
                                    <CheckCheck className="w-4 h-4 text-brand-muted" />
                                )}

                                {msg.status === "read" && (
                                    <CheckCheck className="w-4 h-4 text-brand-accent-strong" />
                                )}

                                {msg.status === "failed" && (
                                    <div className="relative group inline-flex items-center ml-1">

                                        <CircleAlert
                                            className="w-4 h-4 text-brand-danger cursor-pointer
                                                    transition-transform duration-200
                                                    group-hover:scale-110"
                                        />

                                        {/* TOOLTIP TIPO TARJETA GRANDE */}
                                        <div className="
                                            absolute bottom-full right-0 mb-3
                                            hidden group-hover:flex flex-col z-50

                                            bg-brand-raised text-brand-text
                                            border border-brand-border
                                            px-5 py-4
                                            rounded-2xl shadow-2xl
                                            w-[300px]
                                            text-[14px] leading-relaxed
                                            whitespace-normal
                                        ">

                                            <div className="absolute -bottom-2 right-6
                                                            w-4 h-4 bg-brand-raised border-r border-b border-brand-border rotate-45"></div>

                                            <div className="font-bold text-[15px] text-brand-danger">
                                                Whatsapp (Meta) respondió con el siguiente error:
                                            </div>
                                            <div className="mt-1 text-brand-muted">
                                                <div className="text-brand-danger">Error: {msg.errorCode || "000"}</div>
                                                {msg.errorDetail || "Error desconocido"}
                                            </div>
                                        </div>
                                    </div>
                                )}

                            </div>
                        )}
                    </div>
                </div>
            </div>
        ));

        // Añadimos un elemento al final de la lista de mensajes.
        messageElements.push(<div key="infinite-scroll-trigger" ref={ref}></div>);

        return messageElements;
    };

    return (
        <div className="bg-brand-bg h-full w-full flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 space-y-1 flex flex-col-reverse">
                {renderContent()}
            </div>
            {conversationId && <form ref={formRef} onSubmit={handleSendMessage} className="p-4 border-t border-brand-border flex flex-row gap-2">
                <div className="flex-9/10">
                    <CustomInput placeholder="Enviar mensaje"
                     value={text}
                    onChange={(e) => setText(e.target.value)}
                    maxLines={8}
                    sendOnEnter={true}
                    onEnter={() => handleSendMessage(new Event('submit') as unknown as React.FormEvent<HTMLFormElement>)}
                    />
                </div>
                <div className="flex-1/10 max-h-100 self-end">
                    <CustomButton type="submit"
                    /* isLoading={sendMessageMutation.isPending} */>
                       <SendHorizonal></SendHorizonal>
                    </CustomButton>
                </div>
            </form>}
        </div>
    );
}
