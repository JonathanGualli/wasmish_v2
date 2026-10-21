import { Ban } from "lucide-react";
import type { MessageQuote } from "../../../models/message.mode";
import { isAvailableQuote, quoteAuthor } from "../../../utils/messageQuote";
import { MessageTypeIcon } from "../MessageTypeIcon";

interface Props {
    quote: MessageQuote;
    /** La burbuja es nuestra (verde profundo): la cita va en sus tonos. */
    onDeep: boolean;
    contactName: string;
    /** Con equipo, lo nuestro sin autor no dice «Tú». */
    team: boolean;
    /** Ir al original. Sin él (o si Wasmish no lo tiene), la cita solo se lee. */
    onOpen?: () => void;
}

// Los tonos del diseño: sobre la burbuja ajena, gris con barra verde; sobre la
// propia, verde más claro con barra menta. Apagada (eliminado, no disponible), gris.
const TONES = {
    light: { box: "bg-brand-bg", bar: "bg-brand-success", off: "bg-brand-border-strong", name: "text-brand-accent-strong", text: "text-brand-gray-600" },
    deep: { box: "bg-brand-deep-hover", bar: "bg-brand-accent", off: "bg-brand-on-deep-subtle", name: "text-brand-accent", text: "text-brand-on-deep" },
};

/**
 * La cita de un mensaje que responde a otro, dentro de su burbuja y encima del
 * contenido (diseño «Wasmish Chat - Citas y reacciones», 1n): quién escribió el
 * original y un resumen; «Mensaje eliminado» con su autor, o «Mensaje no
 * disponible» sin autor ni enlace, como algo normal.
 */
export const QuotedMessage = ({ quote, onDeep, contactName, team, onOpen }: Props) => {
    const tone = TONES[onDeep ? "deep" : "light"];
    const available = isAvailableQuote(quote);
    const deleted = available && quote.deleted;
    const clickable = available && Boolean(onOpen);
    const thumb = available && !deleted && quote.hasMedia && (quote.type === "image" || quote.type === "sticker");

    const body = (
        <>
            <span className={`self-stretch w-[3px] flex-none ${available && !deleted ? tone.bar : tone.off}`} />
            <span className="flex-1 min-w-0 py-1.5 grid gap-px text-left">
                {available && (
                    <span className={`text-[12.5px] font-semibold truncate ${tone.name}`}>
                        {quoteAuthor(quote, { contactName, team })}
                    </span>
                )}
                <span className={`flex items-start gap-[5px] text-[13px] leading-[1.4] ${tone.text} ${!available || deleted ? "italic" : ""}`}>
                    {deleted ? <Ban size={14} className="flex-none mt-0.5" />
                        : available && <span className="mt-0.5"><MessageTypeIcon type={quote.type} /></span>}
                    <span className="line-clamp-2 [overflow-wrap:anywhere]">
                        {!available ? "Mensaje no disponible" : deleted ? "Mensaje eliminado" : quote.text}
                    </span>
                </span>
            </span>
            {thumb && (
                <img src={`/api/media/${quote.id}`} alt="" loading="lazy"
                    className="flex-none w-[42px] h-[42px] my-1 rounded-[5px] object-cover" />
            )}
        </>
    );

    const box = `flex items-center gap-2.5 pr-2 rounded-[7px] overflow-hidden mb-1.5 ${tone.box}`;
    if (!clickable) {
        return (
            <div className={box} title={available ? undefined : "Es de antes de conectar el número"}>{body}</div>
        );
    }
    return (
        <button type="button" onClick={onOpen} title="Ir al mensaje" className={`${box} w-full cursor-pointer`}>
            {body}
        </button>
    );
};
