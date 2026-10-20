import { useEffect, useRef, useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import type { Message, OwnReaction } from "../../../models/message.mode";
import { reactionErrorText } from "../../../utils/whatsappErrors";

interface Props {
    msg: Message;
    /** La burbuja es nuestra: las reacciones cuelgan a la izquierda (la hora va a la derecha). */
    mine: boolean;
    /** Quitar la nuestra (tocarla) o reintentar/quitar la que falló. */
    onReact: (emoji: string) => void;
}

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Quién puso la nuestra y cuándo: para el tooltip y para el celular. */
const ownLabel = (me: OwnReaction) => {
    if (me.pending) return "Enviando…";
    const who = me.origin === "businessApp" ? "Desde la app de WhatsApp" : me.sentBy?.name ?? "Tú";
    return `${who} · ${formatTime(me.at)}`;
};

/**
 * Las reacciones del mensaje, colgadas del borde inferior de la burbuja, del
 * lado opuesto a la hora (diseño, 1f): la del contacto en blanco y la nuestra
 * en menta claro, que se distinguen sin pasar el ratón. La nuestra dice quién y
 * cuándo (tooltip en la computadora, al tocarla en el celular); enviándose va
 * atenuada; si WhatsApp la rechazó más tarde, va con «!» rojo y, al tocarla,
 * el motivo con Reintentar y Quitar.
 */
export const MessageReactions = ({ msg, mine, onReact }: Props) => {
    const them = msg.reactions?.them;
    const me = msg.reactions?.me;
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // El detalle se cierra al tocar fuera.
    useEffect(() => {
        if (!open) return;
        const close = (event: PointerEvent) => {
            if (!ref.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener("pointerdown", close);
        return () => document.removeEventListener("pointerdown", close);
    }, [open]);

    if (!them && !me) return null;
    const failed = me?.status === "failed";
    // Si falló quitarla, el contacto sigue viendo la de antes: es la que se enseña.
    const shownEmoji = me ? me.emoji ?? me.previousEmoji : null;
    const side = mine ? "left-2.5" : "right-2.5";
    // El tooltip y el detalle se abren hacia el lado libre del hilo: a la
    // derecha en los del contacto (a la izquierda está el borde) y al revés en
    // los nuestros. Hacia el otro lado, una burbuja corta los dejaba cortados.
    const tipSide = mine ? "right-0" : "left-0";

    const ownChip = me && shownEmoji && (
        <span className="relative group/own">
            <button type="button"
                onClick={() => (failed ? setOpen(value => !value) : me.pending ? undefined : onReact(shownEmoji))}
                aria-label={failed ? "Tu reacción no se envió" : `Tu reacción ${shownEmoji}. Tocar para quitarla`}
                className={`flex items-center gap-[3px] h-6 px-[7px] rounded-full border text-sm leading-none text-brand-text
                    shadow-[0_1px_3px_rgba(14,17,22,0.1)] cursor-pointer
                    ${failed ? "bg-brand-danger-soft border-brand-danger-border" : "bg-brand-accent-soft border-brand-green-200"}`}>
                <span className={me.pending ? "opacity-45" : failed ? "opacity-55" : ""}>{shownEmoji}</span>
                {me.pending && <LoaderCircle size={11} strokeWidth={3} className="text-brand-muted motion-safe:animate-spin" />}
                {failed && (
                    <span className="w-[13px] h-[13px] rounded-full bg-brand-danger text-white text-[9px] font-extrabold flex items-center justify-center">!</span>
                )}
            </button>
            {!open && (
                <span className={`pointer-events-none absolute bottom-[calc(100%+6px)] ${tipSide} hidden md:group-hover/own:block whitespace-nowrap
                    bg-brand-text text-white text-xs font-medium leading-[1.3] px-2 py-[5px] rounded-md z-10`}>
                    {failed ? "No se envió · clic para ver" : ownLabel(me)}
                </span>
            )}
            {open && failed && (
                <FailedDetail me={me} canRetry={Boolean(msg.canReact)} side={tipSide}
                    onRetry={() => { setOpen(false); onReact(me.emoji ?? ""); }}
                    onRemove={() => { setOpen(false); onReact(""); }} />
            )}
        </span>
    );

    return (
        // Con el detalle abierto, por encima de las acciones del mensaje (z-10), que si no lo tapaban.
        <div ref={ref} className={`absolute -bottom-[13px] ${side} flex gap-1 ${open ? "z-20" : "z-[2]"}`}>
            {them && (
                <span title="Reacción del contacto"
                    className="flex items-center h-6 px-[7px] rounded-full border border-brand-border bg-brand-surface text-sm leading-none
                        shadow-[0_1px_3px_rgba(14,17,22,0.1)]">
                    {them.emoji}
                </span>
            )}
            {ownChip}
        </div>
    );
};

/** El motivo de una reacción nuestra que WhatsApp rechazó, y qué hacer. */
const FailedDetail = ({ me, canRetry, side, onRetry, onRemove }: {
    me: OwnReaction;
    /** Si ya no se puede reaccionar (más de 30 días), no hay a qué volver a intentar. */
    canRetry: boolean;
    side: string;
    onRetry: () => void;
    onRemove: () => void;
}) => {
    const removing = me.emoji === null;
    return (
        <span className={`absolute bottom-[calc(100%+8px)] ${side} w-[270px] max-w-[calc(100vw-48px)] grid gap-2.5 z-10 cursor-default
            bg-brand-surface border border-brand-border rounded-xl shadow-[0_12px_32px_rgba(14,17,22,0.16)] px-3.5 py-3 text-left`}>
            <span className="flex gap-2 items-start text-[13px] leading-[1.5] text-brand-strong whitespace-normal">
                <CircleAlert size={15} strokeWidth={2.2} className="flex-none mt-0.5 text-brand-danger" />
                <span>
                    <span className="block font-semibold text-brand-text">
                        {removing ? `No se pudo quitar tu ${me.previousEmoji ?? "reacción"}` : "Tu reacción no se envió"}
                    </span>
                    {reactionErrorText(me.errorCode, me.errorDetail)}
                    {!removing && me.previousEmoji && <> El contacto sigue viendo tu {me.previousEmoji}.</>}
                </span>
            </span>
            {canRetry && (
                <span className="flex gap-2 pl-[23px]">
                    <button type="button" onClick={onRetry}
                        className="h-[30px] px-3 rounded-lg border border-brand-border-strong text-[13px] font-semibold text-brand-accent-strong hover:bg-brand-bg cursor-pointer">
                        Reintentar
                    </button>
                    {!removing && (
                        <button type="button" onClick={onRemove}
                            className="h-[30px] px-2.5 rounded-lg text-[13px] font-semibold text-brand-gray-600 hover:bg-brand-bg cursor-pointer">
                            Quitar
                        </button>
                    )}
                </span>
            )}
        </span>
    );
};
