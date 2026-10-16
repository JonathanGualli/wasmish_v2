import { useState } from "react";
import { AlertCircle, ChevronDown, Smartphone } from "lucide-react";
import type { Line } from "../../../../models/line.model";
import { LineSwatch } from "../../../../components/Line/LineSwatch";
import { Pill } from "../../../../components/Pill/Pill";
import { Callout } from "../../../../components/Callout/Callout";
import { CustomButton } from "../../../../components/Button/Button";
import { lineLabel } from "../../../../utils/lineDisplay";
import { DISCONNECTED_CONVERSATIONS_NOTE, disconnectionText } from "../../../../utils/disconnectionReason";
import { LineDetails } from "./LineDetails";

/** «Junto con la app de WhatsApp Business»: alguien también responde desde el celular (2a). */
export const BusinessAppMark = () => (
    <span className="inline-flex items-center gap-1 text-[13px] text-brand-muted">
        <Smartphone size={13} className="flex-none" />Junto con la app de WhatsApp Business
    </span>
);

interface Props {
    line: Line;
    showDefault: boolean;
    onReconnect: (line: Line) => void;
}

/**
 * Una línea que desconectó Meta (`disconnectionReason`): sigue en la lista, con
 * el motivo en palabras y «Volver a conectar» en el mismo aviso (2b, 2c). Las
 * que se desconectaron desde Wasmish van a «Números anteriores».
 */
export const RemovedLineRow = ({ line, showDefault, onReconnect }: Props) => {
    const [detailsOpen, setDetailsOpen] = useState(false);
    const { why, whatToDo } = disconnectionText(line.disconnectionReason);
    return (
        <div className="relative bg-brand-surface px-[18px] py-4 max-sm:px-3.5 grid gap-3 first:rounded-t-[10px] last:rounded-b-[10px]">
            <div className="flex items-center gap-3.5 max-sm:gap-3">
                <LineSwatch colorClass="" disconnected />
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-semibold text-brand-gray-600 break-words">{lineLabel(line)}</span>
                        {showDefault && line.isDefault && <Pill tone="positive">Por defecto</Pill>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-brand-muted">
                        {line.displayPhoneNumber && <span className="font-mono text-brand-gray-600">{line.displayPhoneNumber}</span>}
                        <span className="sm:hidden">· desconectada</span>
                        {line.verifiedName && line.verifiedName !== lineLabel(line) && (
                            <span className="max-sm:hidden">En WhatsApp: <span className="text-brand-strong">{line.verifiedName}</span></span>
                        )}
                    </div>
                    {line.businessApp && <div className="mt-1"><BusinessAppMark /></div>}
                </div>
                <span className="max-sm:hidden flex-none inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-muted">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-border-strong" />Desconectada
                </span>
                <button type="button" onClick={() => setDetailsOpen(open => !open)} aria-expanded={detailsOpen}
                    className={`max-sm:hidden flex-none flex items-center gap-1 h-8 px-2 rounded-[8px] text-[13px] font-semibold
                        text-brand-gray-600 hover:bg-brand-bg transition-colors cursor-pointer ${detailsOpen ? 'bg-brand-bg' : ''}`}>
                    Detalles
                    <ChevronDown size={14} className={`transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
                </button>
            </div>
            <div className="sm:ml-6">
                <Callout tone="warning" icon={<AlertCircle size={16} />} title="Meta desconectó este número"
                    action={<div className="h-9"><CustomButton variant="outline" onClick={() => onReconnect(line)}>Volver a conectar</CustomButton></div>}>
                    <p className="text-sm text-brand-strong">{why}</p>
                    <p className="mt-1 text-sm text-brand-gray-600">{whatToDo} {DISCONNECTED_CONVERSATIONS_NOTE}</p>
                </Callout>
            </div>
            {detailsOpen && <LineDetails line={line} />}
        </div>
    );
};
