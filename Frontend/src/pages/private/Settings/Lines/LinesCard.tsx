import { useState } from "react";
import { AlertCircle, Loader2, Plug, X } from "lucide-react";
import type { Line } from "../../../../models/line.model";
import { CustomButton } from "../../../../components/Button/Button";
import { Callout } from "../../../../components/Callout/Callout";
import { Pill } from "../../../../components/Pill/Pill";
import { useLines } from "../../../../hooks/useLines";
import { useConnectWhatsapp } from "../../../../hooks/useConnectWhatsapp";
import { apiErrorOf } from "../../../../utils/apiError";
import { maskWabaId } from "../../../../utils/lineDisplay";
import { SettingsCard } from "../SettingsCard";
import { LineRow } from "./LineRow";
import { PreviousLines } from "./PreviousLines";
import { DisconnectLineDialog } from "./DisconnectLineDialog";
import { ManualCredentialsForm } from "./ManualCredentialsForm";
import { isBusy } from "./lineActionError";

/** Las líneas activas por WABA, en el orden de la lista (la por defecto, primero). */
const groupByWaba = (lines: Line[]) => {
    const groups = new Map<string, Line[]>();
    for (const line of lines) {
        const key = line.waBusinessId ?? '';
        groups.set(key, [...(groups.get(key) ?? []), line]);
    }
    return [...groups].map(([waBusinessId, groupLines]) => ({ waBusinessId, lines: groupLines }));
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Qué dice el botón de conectar y la nota de al lado, según las líneas y el plan. */
const connectState = ({ activeCount, maxLines, isMultiLine, isConnecting }: {
    activeCount: number; maxLines: number; isMultiLine: boolean; isConnecting: boolean;
}) => {
    if (isConnecting) return { label: 'Conectando…', variant: 'primary' as const, disabled: true, note: 'No cierres esta pestaña.', strong: false };
    if (activeCount === 0) return { label: 'Conectar WhatsApp', variant: 'primary' as const, disabled: false, note: '', strong: false };
    if (!isMultiLine) {
        return {
            label: 'Volver a conectar', variant: 'outline' as const, disabled: false, strong: false,
            note: 'Sirve para renovar el permiso. Si inicias sesión con otro número, sustituye a este: el actual pasa a «Números anteriores» con sus conversaciones.',
        };
    }
    if (activeCount > maxLines) {
        return {
            label: 'Conectar otro número', variant: 'primary' as const, disabled: true, strong: true,
            note: `Tu plan ahora permite ${plural(maxLines, 'línea conectada', 'líneas conectadas')}. Las ${activeCount} siguen funcionando con normalidad; solo no puedes conectar otra.`,
        };
    }
    if (activeCount === maxLines) {
        return {
            label: 'Conectar otro número', variant: 'primary' as const, disabled: true, strong: true,
            note: `Tu plan permite ${plural(maxLines, 'línea conectada', 'líneas conectadas')}. Desconecta una antes de conectar otra, o pide más líneas. Renovar el permiso de un número conectado sí se puede.`,
        };
    }
    return {
        label: 'Conectar otro número', variant: 'primary' as const, disabled: false, strong: false,
        note: 'Para renovar el permiso de un número ya conectado, vuelve a conectarlo: no ocupa otra línea.',
    };
};

/**
 * Ajustes → las líneas de WhatsApp de la cuenta (Fase 2c; diseño: «Wasmish
 * Líneas - Ajustes y superadmin»). Con una sola línea se ve casi como antes;
 * con un plan de varias, la lista agrupada por WABA, el uso del plan y
 * «Conectar otro número».
 */
export const LinesCard = () => {
    const { isLoading, isError, refresh, activeLines, previousLines, maxLines, isMultiLine, colorOf } = useLines();
    const connectWhatsapp = useConnectWhatsapp();
    const [toDisconnect, setToDisconnect] = useState<Line | null>(null);

    const connectError = connectWhatsapp.isError ? apiErrorOf(connectWhatsapp.error, 'No se pudo conectar WhatsApp. Intenta de nuevo.') : null;
    const groups = groupByWaba(activeLines);
    const button = connectState({
        activeCount: activeLines.length, maxLines, isMultiLine, isConnecting: connectWhatsapp.isConnecting,
    });

    return (
        <SettingsCard>
            <div className="grid gap-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h2 className="text-[17px] font-bold tracking-[-0.01em] text-brand-text">
                            {isMultiLine ? 'Líneas de WhatsApp' : 'Línea de WhatsApp'}
                        </h2>
                        <p className="mt-1 max-w-[520px] text-sm leading-[1.5] text-brand-muted">
                            {isMultiLine
                                ? 'Cada línea es un número con sus propias conversaciones. Los contactos son de toda la cuenta.'
                                : 'Vincula tu número iniciando sesión con Facebook. Las credenciales se configuran solas.'}
                        </p>
                    </div>
                    {isMultiLine ? (
                        <span className="flex-none rounded-full bg-brand-bg px-3 py-1.5 font-mono text-[12.5px] font-semibold text-brand-strong tabular-nums">
                            {activeLines.length} de {plural(maxLines, 'línea', 'líneas')}
                        </span>
                    ) : (
                        <Pill tone={activeLines.length > 0 ? 'positive' : 'neutral'}
                            icon={<span className={`w-1.5 h-1.5 rounded-full ${activeLines.length > 0 ? 'bg-brand-success' : 'bg-brand-subtle'}`} />}>
                            {activeLines.length > 0 ? 'Conectado' : 'Sin conectar'}
                        </Pill>
                    )}
                </div>

                {connectError && (
                    <Callout
                        tone={isBusy(connectError) ? 'warning' : 'danger'}
                        icon={<AlertCircle size={16} />}
                        title={isBusy(connectError) ? 'Espera un momento' : 'No se pudo conectar el número'}
                        action={
                            <div className="flex items-center gap-3">
                                {isBusy(connectError) && (
                                    <button type="button" onClick={() => connectWhatsapp.connect()}
                                        className="text-[13px] font-semibold text-brand-accent-strong cursor-pointer">Reintentar</button>
                                )}
                                <button type="button" onClick={() => connectWhatsapp.reset()} aria-label="Cerrar el aviso"
                                    className="flex text-brand-subtle hover:text-brand-gray-600 cursor-pointer"><X size={14} /></button>
                            </div>
                        }
                    >
                        {connectError.message}
                    </Callout>
                )}

                {isLoading && <p className="text-sm text-brand-muted">Cargando las líneas…</p>}
                {isError && (
                    <p className="text-sm text-brand-danger">
                        No se pudieron cargar las líneas.{' '}
                        <button type="button" onClick={refresh} className="font-semibold text-brand-accent-strong cursor-pointer">Reintentar</button>
                    </p>
                )}

                {!isLoading && !isError && activeLines.length === 0 && (
                    <div className="grid gap-1.5 rounded-[10px] border border-dashed border-brand-border-strong p-7 max-sm:p-5">
                        <p className="text-[15px] font-semibold text-brand-text">Aún no hay ningún número conectado</p>
                        <p className="max-w-[520px] text-sm leading-[1.55] text-brand-gray-600">
                            Conecta tu número de WhatsApp Business para recibir y responder mensajes desde Wasmish. Se abre el
                            inicio de sesión de Facebook y las credenciales se configuran solas.
                        </p>
                    </div>
                )}

                {groups.length > 1 && (
                    <p className="-mb-2 text-[13px] text-brand-muted">Las líneas de una misma cuenta de WhatsApp Business comparten plantillas.</p>
                )}
                {groups.map(group => (
                    <div key={group.waBusinessId} className="rounded-[10px] border border-brand-border divide-y divide-brand-raised">
                        {groups.length > 1 && (
                            <div className="flex items-center gap-2.5 rounded-t-[10px] bg-brand-bg px-[18px] py-2 text-xs text-brand-muted">
                                <span className="font-mono font-semibold text-brand-strong">WABA {maskWabaId(group.waBusinessId)}</span>
                                <span className="ml-auto">{plural(group.lines.length, 'línea', 'líneas')}</span>
                            </div>
                        )}
                        {group.lines.map(line => (
                            <LineRow key={line.id} line={line} colorClass={colorOf(line.id)} showDefault={isMultiLine}
                                onDisconnect={setToDisconnect} />
                        ))}
                    </div>
                ))}

                {connectWhatsapp.isConnecting && (
                    <div className="flex items-center gap-3.5 rounded-[10px] border border-dashed border-brand-green-200 bg-brand-green-50 px-[18px] py-4">
                        <Loader2 size={18} className="flex-none animate-spin text-brand-accent-strong" />
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-brand-text">Conectando un número nuevo…</p>
                            <p className="mt-0.5 text-[13px] text-brand-gray-600">
                                Termina el inicio de sesión en la ventana de Facebook. Después Meta confirma el número: tarda unos segundos.
                            </p>
                        </div>
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-4">
                    <div className="h-10 w-full sm:w-auto max-sm:h-12">
                        <CustomButton variant={button.variant} disabled={button.disabled} onClick={() => connectWhatsapp.connect()}>
                            <Plug size={16} />{button.label}
                        </CustomButton>
                    </div>
                    {button.note && (
                        <p className={`flex-1 min-w-[260px] text-[13px] leading-[1.55] ${button.strong ? 'text-brand-strong' : 'text-brand-muted'}`}>
                            {button.note}
                        </p>
                    )}
                </div>

                <PreviousLines lines={previousLines} />
                <ManualCredentialsForm hasToken={activeLines.length > 0} />
            </div>

            <DisconnectLineDialog line={toDisconnect} onClose={() => setToDisconnect(null)} />
        </SettingsCard>
    );
};
