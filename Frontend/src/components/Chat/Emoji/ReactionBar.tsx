import { Plus } from "lucide-react";
import { QUICK_REACTIONS, sameEmoji } from "./emojis";

interface Props {
    /** La nuestra, si la hay: va marcada y tocarla la quita. */
    current: string | null;
    onPick: (emoji: string) => void;
    onMore: () => void;
    /** En el celular, más grande para el dedo. */
    large?: boolean;
}

/** La barra de seis y el «+» del selector completo (diseño, 1b y m2). */
export const ReactionBar = ({ current, onPick, onMore, large = false }: Props) => {
    const size = large ? "w-[42px] h-[42px] text-2xl" : "w-9 h-9 text-xl";
    return (
        <div role="menu" aria-label="Reaccionar"
            className="flex items-center gap-0.5 p-1 bg-brand-surface border border-brand-border rounded-[26px] shadow-[0_8px_24px_rgba(14,17,22,0.14)]">
            {QUICK_REACTIONS.map(emoji => {
                const mine = sameEmoji(emoji, current);
                return (
                    <button key={emoji} type="button" role="menuitem" onClick={() => onPick(emoji)}
                        title={mine ? "Quitar tu reacción" : `Reaccionar con ${emoji}`}
                        aria-label={mine ? `Quitar tu reacción ${emoji}` : `Reaccionar con ${emoji}`}
                        className={`${size} rounded-full flex items-center justify-center leading-none cursor-pointer transition-colors
                            ${mine ? "bg-brand-accent-soft" : "hover:bg-brand-raised"}`}>
                        {emoji}
                    </button>
                );
            })}
            <button type="button" role="menuitem" onClick={onMore} title="Más emojis" aria-label="Más emojis"
                className={`${size} rounded-full flex items-center justify-center bg-brand-bg text-brand-gray-600
                    hover:bg-brand-border hover:text-brand-text cursor-pointer transition-colors`}>
                <Plus size={18} strokeWidth={2.2} />
            </button>
        </div>
    );
};
