import { useEffect, useState } from "react";
import { useConversationMessages } from "../../hooks/useConversationMessages";
import type { Message } from "../../models/message.mode.ts";
import { CustomButton } from "../Button/Button.tsx";
import { CustomInput } from "../Input/Input.tsx";
import { useConversationSendMessages } from "../../hooks/useConversationSendMessages.ts";
import { useModalContext } from "../Modal/context/UseModalContext.ts";
import type { AxiosError } from "axios";
import { useInView } from "react-intersection-observer";


interface Props {
    conversationId: string | null;
}

interface ErrorItem {
  message: string;
}


// Componente para no repetir código de estados
const CenteredMessage = ({ children }: { children: React.ReactNode }) => (
    <div className="flex-1 flex items-center justify-center text-gray-500 p-4 text-center">
        {children}
    </div>
);

export const ChatThread = ({ conversationId }: Props) => {

    const { data: messages, isLoading, isError, fetchNextPage, hasNextPage} = useConversationMessages(conversationId || "");
    const [text, setText] = useState("");
    const sendMessageMutation = useConversationSendMessages();
    const { setState, setContent } = useModalContext();

    const { ref, inView } = useInView();

    useEffect(() => {
        if (inView && hasNextPage) {
            void fetchNextPage();
        }
    }, [inView, hasNextPage, fetchNextPage]);

    const handleSendMessage = (event: React.FormEvent) => {
        event.preventDefault();
        sendMessageMutation.mutate({ conversationId: conversationId!, message: text }, {
            onSuccess: () => {
                setText("");
            }, onError: (error: Error) => {
                console.log(error);
                 setContent( 
                    <div className="text-red-500">
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

        // mapeo de mensajes
        const messageElements = messages.map((msg: Message) => (
            <div
                key={msg.id}
                className={`flex w-full ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`p-3 rounded-lg max-w-xs md:max-w-md ${msg.sender === 'me' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'}`}>
                        {msg.text}
                    </div>
            </div>
        ));

        // Añadimos un elemento al final de la lista de mensajes.
        messageElements.push(<div ref={ref}></div>);

        return messageElements;
    };

    return (
        <div className="bg-white h-full w-full flex flex-col border-l">
            <div className="flex-1 overflow-y-auto p-4 space-y-1 flex flex-col-reverse">
                {renderContent()}
            </div>
            {conversationId && <form onSubmit={handleSendMessage} className="p-4 border-t flex flex-row gap-2">
                <div className="flex-7/10">
                    <CustomInput placeholder="Enviar mensaje"
                    value={text}
                    onChange={(e) => setText(e.target.value)}/>
                </div>
                <div className="flex-3/10">
                    <CustomButton type="submit"
                    isLoading={sendMessageMutation.isPending}>
                        Enviar
                    </CustomButton>
                </div>
            </form>}
        </div>
    );
}
