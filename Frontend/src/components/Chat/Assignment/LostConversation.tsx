import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { useTransferRequest } from "../../../hooks/useTransferRequest";
import { initials } from "../../../utils/initials";
import { firstName } from "../../../utils/assignment";

/** Lo que perdió quien mira (Fase 4): se la pasaron a otra persona, o respondió otra antes. */
export interface LostState {
    conversationId: string;
    title: string;
    /** Respondió otra persona antes: el texto que no salió, y quién la atiende (diseño, 3c). */
    raced?: { assignedToName: string | null; text: string };
}

interface Props {
    lost: LostState;
    /** Volver a la bandeja en el celular. */
    onBack?: () => void;
}

/**
 * El chat cerrado, sin enseñar nada más de la conversación (diseño, 2b). Si la
 * perdió al responder (3c), su texto se queda para copiarlo, y puede pedir que
 * se la pasen.
 */
export const LostConversation = ({ lost, onBack }: Props) => {
    const { raced } = lost;
    return (
        <div className="h-full w-full flex flex-col items-center justify-center gap-2.5 text-center p-10 max-md:px-4 bg-brand-bg">
            <span className="w-12 h-12 rounded-xl bg-brand-surface border border-brand-border text-brand-strong
                text-[15px] font-bold flex items-center justify-center">
                {raced ? initials(raced.assignedToName ?? '') : <ArrowRight size={22} className="text-brand-gray-600" />}
            </span>
            <span className="text-[17px] font-bold tracking-[-0.01em] text-brand-text">{lost.title}</span>
            <span className="text-sm text-brand-muted">
                {raced ? 'Respondió antes que tú. Tu mensaje no se envió.' : 'Ya no está en tu bandeja.'}
            </span>
            {raced && <UnsentText text={raced.text} />}
            {raced && <RequestTransfer conversationId={lost.conversationId} ownerName={raced.assignedToName} />}
            {onBack && (
                <button type="button" onClick={onBack}
                    className="md:hidden mt-2 text-sm font-semibold text-brand-accent-strong cursor-pointer">
                    Volver a la bandeja
                </button>
            )}
        </div>
    );
};

/** «Tu mensaje», con «Copiar»: lo escrito no se pierde. */
const UnsentText = ({ text }: { text: string }) => {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        void navigator.clipboard?.writeText(text).then(() => setCopied(true), () => undefined);
    };
    return (
        <div className="mt-1.5 w-full max-w-[360px] border border-dashed border-brand-border-strong rounded-[10px] px-3 py-2.5 text-left grid gap-1">
            <span className="text-[11px] font-bold tracking-[0.08em] uppercase text-brand-muted">Tu mensaje</span>
            <span className="text-sm leading-[1.5] text-brand-strong whitespace-pre-line [overflow-wrap:anywhere]">{text}</span>
            <button type="button" onClick={copy}
                className="justify-self-start text-[12.5px] font-semibold text-brand-accent-strong hover:underline cursor-pointer">
                {copied ? 'Copiado' : 'Copiar'}
            </button>
        </div>
    );
};

/** Pedir que se la pasen, y cómo va. Si se la pasan, el chat vuelve solo (`conversation_assigned`). */
const RequestTransfer = ({ conversationId, ownerName }: { conversationId: string; ownerName: string | null }) => {
    const { state, request, isPending } = useTransferRequest(conversationId);
    const owner = firstName({ id: '', name: ownerName });

    if (state.status === 'sent') {
        return <span className="mt-1.5 text-[13px] text-brand-gray-600">Solicitud enviada. Te avisamos cuando {owner} o un supervisor responda.</span>;
    }
    return (
        <div className="mt-1.5 grid gap-2 justify-items-center">
            {state.status === 'rejected' && (
                <span className="text-[13px] text-brand-gray-600">{firstName(state.answeredBy)} no te la pasó.</span>
            )}
            <button type="button" onClick={request} disabled={isPending}
                className="h-10 px-4 rounded-[8px] border border-brand-border-strong bg-brand-surface text-sm font-semibold
                    text-brand-accent-strong hover:bg-brand-bg transition-colors cursor-pointer disabled:cursor-not-allowed disabled:text-brand-subtle">
                {state.status === 'rejected' ? 'Solicitar otra vez' : 'Solicitar que te la transfieran'}
            </button>
        </div>
    );
};
