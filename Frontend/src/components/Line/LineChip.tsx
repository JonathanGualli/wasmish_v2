import { useLines } from "../../hooks/useLines";
import { lineLabel, lineNumber, shortLineLabel } from "../../utils/lineDisplay";
import { LineSwatch } from "./LineSwatch";

interface Props {
    lineId: string | null | undefined;
    /**
     * `compact`: junto a la hora en la bandeja y en las listas, con la etiqueta
     * corta. `header`: la pastilla de la cabecera del chat, con el número.
     */
    variant?: 'compact' | 'header';
}

/**
 * De qué línea es una conversación o una campaña: su cuadrito y su etiqueta,
 * y «desconectada» si lo está. Solo con más de una línea en la cuenta
 * (`showLines`): con una, la app se ve como siempre. Mientras cargan las
 * líneas, un hueco gris del mismo tamaño si la última vez había varias.
 */
export const LineChip = ({ lineId, variant = 'compact' }: Props) => {
    const { showLines, linesPending, lineById, colorOf } = useLines();

    if (linesPending) {
        return variant === 'header'
            ? <span aria-hidden className="flex-none w-[150px] h-9 rounded-[8px] bg-brand-raised" />
            : <span aria-hidden className="flex-none w-[54px] h-[9px] rounded-[3px] bg-brand-raised" />;
    }

    const line = lineById(lineId);
    if (!showLines || !line) return null;
    const disconnected = line.status === 'disconnected';

    if (variant === 'header') {
        return (
            <span title="Línea de esta conversación"
                className={`flex-none inline-flex items-center gap-2 h-9 px-3 rounded-[8px] border border-brand-border text-[13px]
                    ${disconnected ? 'bg-brand-bg' : 'bg-brand-surface'}`}>
                <LineSwatch colorClass={colorOf(line.id)} disconnected={disconnected} />
                <span className={`max-w-[160px] truncate font-semibold ${disconnected ? 'text-brand-gray-600' : 'text-brand-text'}`}>
                    {lineLabel(line)}
                </span>
                {disconnected ? (
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.05em] bg-brand-raised text-brand-muted">
                        Desconectada
                    </span>
                ) : (
                    <span className="font-mono text-[11.5px] text-brand-muted tabular-nums">{lineNumber(line)}</span>
                )}
            </span>
        );
    }

    return (
        <span title={lineLabel(line)}
            className={`flex-none inline-flex items-center gap-[5px] text-[11.5px] font-semibold whitespace-nowrap
                ${disconnected ? 'text-brand-muted' : 'text-brand-gray-600'}`}>
            <LineSwatch colorClass={colorOf(line.id)} disconnected={disconnected} size="sm" />
            <span className="max-w-[72px] md:max-w-[96px] truncate">{shortLineLabel(line)}</span>
            {disconnected && <span className="font-medium">desconectada</span>}
        </span>
    );
};
