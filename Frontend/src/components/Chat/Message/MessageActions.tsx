import { CornerUpLeft, Smile } from "lucide-react";
import type { Message } from "../../../models/message.mode";
import { ReactionBar } from "../Emoji/ReactionBar";
import { currentOwnEmoji } from "../../../utils/messageActions";

/**
 * Las acciones de un mensaje en la computadora (diseño, 1b y 1c): al pasar el
 * ratón, Reaccionar y Responder fuera de la burbuja, del lado libre. Solo las
 * que se pueden usar: en lo nuestro, solo Responder. El relleno del lado de la
 * burbuja es un puente: el ratón cruza el hueco sin que se escondan.
 *
 * Con el teclado, aparecen al llegar a ellas con Tab: por eso se esconden con
 * opacidad y no con `display: none`, que las sacaba del orden del Tab (al
 * mover el foco, Chrome las volvía a mirar ya escondidas; revisión de Codex
 * del PR #117). Un clic con el ratón no las deja fijas (`:focus-visible`).
 */
export const HoverActions = ({ msg, mine, barOpen, onToggleBar, onReply }: {
    msg: Message;
    mine: boolean;
    barOpen: boolean;
    onToggleBar: () => void;
    onReply: () => void;
}) => (
    <div className={`absolute top-0 z-10 ${mine ? "right-full pr-1.5" : "left-full pl-1.5"} flex max-md:hidden
        ${barOpen ? "" : `opacity-0 pointer-events-none group-hover/msg:opacity-100 group-hover/msg:pointer-events-auto
            group-has-[:focus-visible]/msg:opacity-100 group-has-[:focus-visible]/msg:pointer-events-auto`}`}>
        <div className="flex gap-0.5 p-[3px] bg-brand-surface border border-brand-border rounded-[9px] shadow-[0_4px_12px_rgba(14,17,22,0.1)]">
            {msg.canReact && (
                <ActionButton title="Reaccionar" active={barOpen} onClick={onToggleBar}><Smile size={17} /></ActionButton>
            )}
            {msg.canReply && (
                <ActionButton title="Responder" onClick={onReply}><CornerUpLeft size={17} /></ActionButton>
            )}
        </div>
    </div>
);

const ActionButton = ({ title, active = false, onClick, children }: {
    title: string;
    active?: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) => (
    <button type="button" title={title} aria-label={title} onClick={onClick}
        className={`w-[30px] h-[30px] rounded-[7px] flex items-center justify-center cursor-pointer transition-colors
            ${active ? "bg-brand-raised text-brand-text" : "text-brand-gray-600 hover:bg-brand-raised hover:text-brand-text"}`}>
        {children}
    </button>
);

/** Dónde estaba la burbuja al abrir el menú, en la pantalla. */
export interface MenuAnchor {
    top: number;
    bottom: number;
    left: number;
    right: number;
}

// Medidas del menú del celular: la barra grande (42 + 8 de relleno) y la fila «Responder».
const PHONE_BAR_H = 52;
const PHONE_ROW_H = 50;
const GAP = 10;
// Lo que tapan la cabecera del chat y el campo de escribir, más un margen.
const PHONE_TOP_RESERVED = 72;
const PHONE_BOTTOM_RESERVED = 120;

/**
 * Dónde van la barra y «Responder» en el celular: la barra encima de la
 * burbuja y «Responder» debajo (diseño, m2). Si debajo no cabe (el último
 * mensaje, junto al campo de escribir), los dos encima; si encima tampoco, los
 * dos debajo. En posición fija: dentro del hilo, el borde los cortaba.
 */
const phoneLayout = (anchor: MenuAnchor, hasBar: boolean, hasRow: boolean) => {
    const viewport = window.innerHeight;
    const roomBelow = viewport - PHONE_BOTTOM_RESERVED - anchor.bottom;
    const roomAbove = anchor.top - PHONE_TOP_RESERVED;
    const needAbove = (hasBar ? PHONE_BAR_H + GAP : 0);
    const needBelow = (hasRow ? PHONE_ROW_H + GAP : 0);
    if (roomBelow >= needBelow && roomAbove >= needAbove) {
        return { barTop: anchor.top - PHONE_BAR_H - GAP + 2, rowTop: anchor.bottom + GAP };
    }
    if (roomBelow < needBelow) {
        const barTop = anchor.top - PHONE_BAR_H - GAP + 2;
        return { barTop, rowTop: (hasBar ? barTop : anchor.top) - PHONE_ROW_H - GAP };
    }
    return { barTop: anchor.bottom + GAP, rowTop: anchor.bottom + GAP + (hasBar ? PHONE_BAR_H + GAP : 0) };
};

/**
 * Con el menú abierto: la barra de reacciones encima de la burbuja (o debajo,
 * si arriba no cabe) y, en el celular, «Responder» (diseño, m2 y m3).
 */
export const MessageMenu = ({ msg, mine, phone, below, anchor, onReact, onMore, onReply }: {
    msg: Message;
    mine: boolean;
    phone: boolean;
    below: boolean;
    anchor: MenuAnchor | null;
    onReact: (emoji: string) => void;
    onMore: () => void;
    onReply: () => void;
}) => {
    const bar = msg.canReact && (
        <ReactionBar current={currentOwnEmoji(msg)} onPick={onReact} onMore={onMore} large={phone} />
    );
    const row = msg.canReply && (
        <div className="w-[210px] bg-brand-surface rounded-xl overflow-hidden shadow-[0_12px_32px_rgba(14,17,22,0.22)]">
            <button type="button" onClick={onReply}
                className="w-full h-[50px] px-4 flex items-center justify-between text-base font-medium text-brand-text cursor-pointer">
                Responder <CornerUpLeft size={19} className="text-brand-gray-600" />
            </button>
        </div>
    );

    if (phone && anchor) {
        const { barTop, rowTop } = phoneLayout(anchor, Boolean(bar), Boolean(row));
        // Del lado de la burbuja, sin salirse de la pantalla.
        const horizontal = mine
            ? { right: Math.max(8, window.innerWidth - anchor.right) }
            : { left: Math.max(8, anchor.left) };
        return (
            <>
                {bar && <div className="fixed z-30" style={{ top: barTop, ...horizontal }}>{bar}</div>}
                {row && <div className="fixed z-30" style={{ top: rowTop, ...horizontal }}>{row}</div>}
            </>
        );
    }
    return bar ? (
        <div className={`absolute z-30 ${mine ? "right-0" : "left-0"} ${below ? "top-[calc(100%+8px)]" : "bottom-[calc(100%+8px)]"}`}>
            {bar}
        </div>
    ) : null;
};
