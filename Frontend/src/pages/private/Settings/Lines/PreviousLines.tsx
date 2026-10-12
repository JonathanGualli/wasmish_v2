import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Line } from "../../../../models/line.model";
import { LineSwatch } from "../../../../components/Line/LineSwatch";
import { formatLineDate, lineLabel, lineNumber } from "../../../../utils/lineDisplay";
import { LineDetails } from "./LineDetails";

const PreviousLine = ({ line }: { line: Line }) => {
    const [detailsOpen, setDetailsOpen] = useState(false);
    return (
        <div className="bg-brand-surface px-[18px] py-3.5 max-sm:px-3.5 grid gap-3">
            <div className="flex items-center gap-3.5">
                <LineSwatch colorClass="" disconnected />
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-brand-gray-600 break-words">{lineLabel(line)}</div>
                    <div className="mt-0.5 text-[13px] text-brand-muted">
                        <span className="font-mono">{lineNumber(line)}</span>
                        {line.disconnectedAt && <> · desconectado el {formatLineDate(line.disconnectedAt)}</>}
                    </div>
                </div>
                <span className="max-sm:hidden inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-muted">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-border-strong" />Desconectada
                </span>
                <button type="button" onClick={() => setDetailsOpen(open => !open)} aria-expanded={detailsOpen}
                    className="flex-none flex items-center gap-1 h-8 px-2 rounded-[8px] text-[13px] font-semibold text-brand-gray-600
                        hover:bg-brand-bg transition-colors cursor-pointer">
                    Detalles
                    <ChevronDown size={14} className={`transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
                </button>
            </div>
            {detailsOpen && <LineDetails line={line} />}
        </div>
    );
};

/** Los números desconectados, plegados: solo se consultan; para reactivar uno, se vuelve a conectar. */
export const PreviousLines = ({ lines }: { lines: Line[] }) => {
    const [open, setOpen] = useState(false);
    if (lines.length === 0) return null;

    return (
        <div className="border-t border-brand-raised pt-[18px] grid gap-3">
            <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}
                className="flex items-center gap-1.5 min-h-11 sm:min-h-0 text-sm font-semibold text-brand-gray-600 cursor-pointer">
                <ChevronRight size={16} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
                Números anteriores
                <span className="font-mono text-xs font-medium text-brand-muted">{lines.length}</span>
                <span className="ml-auto text-[12.5px] font-medium text-brand-muted">Solo consulta</span>
            </button>
            {open && (
                <>
                    <p className="text-[13px] leading-[1.55] text-brand-gray-600">
                        Ya no envían ni reciben mensajes. Sus conversaciones siguen en Chats. Para reactivar uno, vuelve a
                        conectar ese mismo número: recupera su historial.
                    </p>
                    <div className="rounded-[10px] border border-brand-border overflow-hidden divide-y divide-brand-raised">
                        {lines.map(line => <PreviousLine key={line.id} line={line} />)}
                    </div>
                </>
            )}
        </div>
    );
};
