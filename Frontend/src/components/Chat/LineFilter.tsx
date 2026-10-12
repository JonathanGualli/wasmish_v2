import { Fragment, useMemo } from "react";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { Check, ChevronDown } from "lucide-react";
import { useLines } from "../../hooks/useLines";
import type { Conversation } from "../../models/conversation.mode";
import type { Line } from "../../models/line.model";
import { lineLabel, lineNumber } from "../../utils/lineDisplay";
import { LineSwatch } from "../Line/LineSwatch";

/** Todas las conversaciones, o las de una línea (su id). */
export const ALL_LINES = 'all';

interface Props {
    value: string;
    onChange: (value: string) => void;
    conversations: Conversation[];
}

/** Las conversaciones con algo sin leer, por línea. */
const countUnread = (conversations: Conversation[]) => {
    const byLine = new Map<string, number>();
    for (const c of conversations) {
        if (c.unreadCount > 0 && c.lineId) byLine.set(c.lineId, (byLine.get(c.lineId) ?? 0) + 1);
    }
    return byLine;
};

const UnreadBadge = ({ count }: { count: number }) => (count > 0 ? (
    <span className="flex-none inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-[9px]
        bg-brand-accent text-brand-ink text-[10px] font-bold tabular-nums">
        {count}
    </span>
) : null);

const Option = ({ value, swatch, title, hint, count, selected }: {
    value: string; swatch: React.ReactNode; title: string; hint?: string; count: number; selected: boolean;
}) => (
    <ListboxOption value={value}
        className="flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 max-sm:min-h-12 cursor-pointer data-[focus]:bg-brand-bg data-[selected]:bg-brand-bg">
        {swatch}
        <span className="flex-1 min-w-0">
            <span className="block truncate text-sm font-semibold text-brand-text">{title}</span>
            {hint && <span className="block text-xs text-brand-muted">{hint}</span>}
        </span>
        <UnreadBadge count={count} />
        {selected && <Check size={15} strokeWidth={2.6} className="flex-none text-brand-accent-strong" />}
    </ListboxOption>
);

/**
 * Filtrar la bandeja por línea, bajo la búsqueda: «Todas las líneas» o una,
 * también las desconectadas (solo se consultan). Cada opción dice cuántas
 * conversaciones tiene sin leer y, con una línea elegida, el filtro avisa de
 * las que hay en las otras. Solo con más de una línea (`showLines`).
 */
export const LineFilter = ({ value, onChange, conversations }: Props) => {
    const { showLines, linesPending, lines, activeLines, previousLines, lineById, colorOf } = useLines();
    const unread = useMemo(() => countUnread(conversations), [conversations]);

    if (linesPending) return <span aria-hidden className="block w-[132px] h-[30px] rounded-[8px] bg-brand-raised" />;
    if (!showLines) return null;

    const selected = lineById(value);
    const totalUnread = conversations.filter(c => c.unreadCount > 0).length;
    const unreadElsewhere = selected ? totalUnread - (unread.get(selected.id) ?? 0) : 0;
    const swatchOf = (line: Line) => <LineSwatch colorClass={colorOf(line.id)} disconnected={line.status === 'disconnected'} size="sm" />;

    return (
        <div className="relative flex items-center gap-2">
            <Listbox value={selected ? selected.id : ALL_LINES} onChange={onChange}>
                {({ open }) => (
                    <>
                        <ListboxButton
                            className={`inline-flex items-center gap-[7px] h-[30px] max-sm:h-9 pl-2.5 pr-2 rounded-[8px] border
                                text-[12.5px] font-semibold text-brand-strong cursor-pointer transition-colors
                                ${selected || open ? 'border-brand-accent-strong' : 'border-brand-border-strong'}
                                ${open ? 'bg-brand-bg' : 'bg-brand-surface'}`}>
                            <span className="flex gap-0.5">
                                {selected ? swatchOf(selected) : lines.slice(0, 4).map(line => <Fragment key={line.id}>{swatchOf(line)}</Fragment>)}
                            </span>
                            <span className="max-w-[160px] truncate">{selected ? lineLabel(selected) : 'Todas las líneas'}</span>
                            <ChevronDown size={13} strokeWidth={2.2} />
                        </ListboxButton>
                        {open && <div aria-hidden className="sm:hidden fixed inset-0 z-40 bg-brand-ink/50" />}
                        <ListboxOptions
                            className="absolute z-50 left-0 top-[38px] w-[300px] rounded-xl border border-brand-border bg-brand-surface p-1.5
                                shadow-[0_18px_44px_rgba(14,17,22,0.16)] focus:outline-none
                                max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:w-full
                                max-sm:rounded-b-none max-sm:rounded-t-[20px] max-sm:px-4 max-sm:pt-2.5 max-sm:pb-7">
                            <div className="sm:hidden">
                                <div className="mx-auto mb-2.5 h-1 w-10 rounded-full bg-brand-border-strong" />
                                <div className="px-1 pb-2.5 text-base font-bold text-brand-text">Ver conversaciones de</div>
                            </div>
                            <Option value={ALL_LINES} swatch={<LineSwatch colorClass="bg-brand-text" size="sm" />}
                                title="Todas las líneas" count={totalUnread} selected={!selected} />
                            {activeLines.map(line => (
                                <Option key={line.id} value={line.id} swatch={swatchOf(line)} title={lineLabel(line)}
                                    hint={lineNumber(line)} count={unread.get(line.id) ?? 0} selected={selected?.id === line.id} />
                            ))}
                            {previousLines.length > 0 && (
                                <div className="mx-1.5 mt-1.5 pt-2.5 pb-1 border-t border-brand-raised
                                    text-[10.5px] font-bold uppercase tracking-[0.1em] text-brand-muted">
                                    Números anteriores
                                </div>
                            )}
                            {previousLines.map(line => (
                                <Option key={line.id} value={line.id} swatch={swatchOf(line)} title={lineLabel(line)}
                                    hint="Desconectada · solo consulta" count={unread.get(line.id) ?? 0} selected={selected?.id === line.id} />
                            ))}
                        </ListboxOptions>
                    </>
                )}
            </Listbox>
            {unreadElsewhere > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs text-brand-gray-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-accent" />
                    {unreadElsewhere} sin leer en otras
                </span>
            )}
        </div>
    );
};
