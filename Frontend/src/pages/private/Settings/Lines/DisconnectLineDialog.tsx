import { useState } from "react";
import { AlertTriangle, ArrowRight, Unplug } from "lucide-react";
import type { Line } from "../../../../models/line.model";
import { ConfirmDialog } from "../../../../components/Dialog/ConfirmDialog";
import { Callout } from "../../../../components/Callout/Callout";
import { Checkbox } from "../../../../components/Checkbox/Checkbox";
import { LineSwatch } from "../../../../components/Line/LineSwatch";
import { useLines } from "../../../../hooks/useLines";
import { apiErrorOf } from "../../../../utils/apiError";
import { lineLabel, lineNumber } from "../../../../utils/lineDisplay";
import { isBusy } from "./lineActionError";

interface Props {
    /** La línea a desconectar; `null` = el diálogo cerrado. */
    line: Line | null;
    onClose: () => void;
}

/**
 * Confirmar que se desconecta una línea. Si es la por defecto, dice por cuál
 * enviará la API; si es la única conectada, pesa más: hay que marcar que se
 * entiende que la cuenta se queda sin WhatsApp. Un error se queda dentro, sin cerrar.
 */
export const DisconnectLineDialog = ({ line, onClose }: Props) => {
    const { activeLines, nextDefaultLine, colorOf, disconnect } = useLines();
    const [understood, setUnderstood] = useState(false);

    const isOnlyLine = Boolean(line) && activeLines.length === 1;
    const nextLine = line?.isDefault && !isOnlyLine ? nextDefaultLine : null;
    const error = disconnect.isError ? apiErrorOf(disconnect.error) : null;

    const close = () => {
        setUnderstood(false);
        disconnect.reset();
        onClose();
    };

    if (!line) return null;

    return (
        <ConfirmDialog
            open
            tone="danger"
            icon={<Unplug size={20} />}
            title={`Desconectar ${lineLabel(line)}`}
            description={
                <span className="inline-flex items-center gap-2 text-[13px] text-brand-muted">
                    <LineSwatch colorClass={colorOf(line.id)} size="sm" />
                    <span className="font-mono">{lineNumber(line)}</span>
                </span>
            }
            confirmLabel={isOnlyLine ? 'Desconectar número' : 'Desconectar'}
            confirmDisabled={isOnlyLine && !understood}
            isLoading={disconnect.isPending}
            onConfirm={() => disconnect.mutate(line.id, { onSuccess: close })}
            onCancel={close}
        >
            <p className="text-sm leading-[1.6] text-brand-strong">
                Dejarás de enviar y recibir mensajes de este número en Wasmish. Sus conversaciones se conservan.
            </p>
            {nextLine && (
                <div className="flex flex-wrap items-center gap-2.5 rounded-[10px] bg-brand-bg px-3.5 py-3 text-sm text-brand-strong">
                    <ArrowRight size={16} className="flex-none text-brand-gray-600" />
                    <span>La API pasará a enviar por</span>
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                        <LineSwatch colorClass={colorOf(nextLine.id)} size="sm" />{lineLabel(nextLine)}
                    </span>
                </div>
            )}
            {isOnlyLine && (
                <>
                    <div className="rounded-[10px] border border-brand-danger-border bg-brand-danger-soft px-3.5 py-3 text-sm leading-[1.55] text-brand-strong">
                        <span className="font-semibold text-brand-danger">Es tu único número conectado.</span>{' '}
                        La API dejará de enviar hasta que conectes un número, y no podrás responder chats desde Wasmish.
                    </div>
                    <div className="flex items-start gap-2.5 text-sm text-brand-strong">
                        <Checkbox checked={understood} onChange={() => setUnderstood(value => !value)}
                            label="Entiendo que mi cuenta se queda sin WhatsApp hasta que conecte un número." />
                        <span className="cursor-pointer" onClick={() => setUnderstood(value => !value)}>
                            Entiendo que mi cuenta se queda sin WhatsApp hasta que conecte un número.
                        </span>
                    </div>
                </>
            )}
            {error && (
                <Callout tone={isBusy(error) ? 'warning' : 'danger'} icon={<AlertTriangle size={16} />}>
                    {error.message}
                </Callout>
            )}
        </ConfirmDialog>
    );
};
