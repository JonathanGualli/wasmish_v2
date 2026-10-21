import { CornerUpLeft, X } from "lucide-react";
import type { Message } from "../../../models/message.mode";
import { quoteAuthor, quoteFromMessage } from "../../../utils/messageQuote";
import { MessageTypeIcon } from "../MessageTypeIcon";

interface Props {
    message: Message;
    contactName: string;
    team: boolean;
    onCancel: () => void;
}

/**
 * «Respondiendo a …» sobre el campo de escribir (diseño, 1g a 1i y m5): quién
 * escribió el original y una línea recortada, con su icono y su miniatura si es
 * una foto. Escape (en la computadora) o la ✕ la quitan.
 */
export const ReplyBar = ({ message, contactName, team, onCancel }: Props) => {
    const quote = quoteFromMessage(message);
    const thumb = (message.hasMedia || message.pending) && (message.type === "image" || message.type === "sticker");
    return (
        <div className="flex items-center gap-2.5 pr-1.5 bg-brand-bg border border-brand-border rounded-[10px] overflow-hidden">
            <span className="self-stretch w-[3px] flex-none bg-brand-success" />
            <CornerUpLeft size={16} className="flex-none text-brand-gray-600" />
            <div className="flex-1 min-w-0 py-2 grid gap-px">
                <p className="text-[12.5px] text-brand-gray-600 truncate">
                    Respondiendo a <span className="font-semibold text-brand-accent-strong">{quoteAuthor(quote, { contactName, team })}</span>
                </p>
                <p className="flex items-center gap-[5px] min-w-0 text-[13.5px] text-brand-strong">
                    <MessageTypeIcon type={message.type} />
                    <span className="truncate">{message.text}</span>
                </p>
            </div>
            {thumb && (
                <img src={message.pending?.localUrl ?? `/api/media/${message.id}`} alt=""
                    className="flex-none w-10 h-10 rounded-md object-cover" />
            )}
            <kbd className="max-md:hidden flex-none font-mono text-[10.5px] text-brand-muted border border-brand-border-strong rounded px-[5px] py-px">Esc</kbd>
            <button type="button" onClick={onCancel} title="No responder citando"
                className="flex-none w-10 h-10 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-brand-gray-600 hover:bg-brand-border cursor-pointer">
                <X size={16} strokeWidth={2.2} />
            </button>
        </div>
    );
};
