import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Plug, X } from "lucide-react";
import { LINE_ERROR, type Line } from "../../../../models/line.model";
import { CustomButton } from "../../../../components/Button/Button";
import { Callout } from "../../../../components/Callout/Callout";
import { Pill } from "../../../../components/Pill/Pill";
import { LINES_QUERY_KEY, useLines } from "../../../../hooks/useLines";
import { useThrottledInvalidate } from "../../../../hooks/useThrottledInvalidate";
import { useSSE } from "../../../../context/sse.context";
import { useConnectWhatsapp } from "../../../../hooks/useConnectWhatsapp";
import { apiErrorOf } from "../../../../utils/apiError";
import { maskWabaId } from "../../../../utils/lineDisplay";
import { SettingsCard } from "../SettingsCard";
import { LineRow } from "./LineRow";
import { RemovedLineRow } from "./RemovedLineRow";
import { ConnectQuestion } from "./ConnectQuestion";
import { PreviousLines } from "./PreviousLines";
import { DisconnectLineDialog } from "./DisconnectLineDialog";
import { ManualCredentialsForm } from "./ManualCredentialsForm";
import { isBusy } from "./lineActionError";
import { LINE_SWATCH_SKELETON, SettingsListSkeleton } from "../SettingsListSkeleton";
import { SkeletonBox, SkeletonPill } from "../../../../components/Skeleton/Skeleton";

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
const connectState = ({ activeCount, maxLines, isMultiLine, isConnecting, hasRemoved }: {
    activeCount: number; maxLines: number; isMultiLine: boolean; isConnecting: boolean;
    /** Hay una línea que desconectó Meta: lo natural es volver a conectarla (2c). */
    hasRemoved: boolean;
}) => {
    if (isConnecting) return { label: 'Conectando…', variant: 'primary' as const, disabled: true, note: 'No cierres esta pestaña.', strong: false };
    if (activeCount === 0 && hasRemoved) {
        return { label: 'Volver a conectar', variant: 'outline' as const, disabled: false, strong: false,
            note: 'Vuelve a conectar este mismo número para recuperar sus conversaciones.' };
    }
    if (activeCount === 0) return { label: 'Conectar WhatsApp', variant: 'primary' as const, disabled: false, note: '', strong: false };
    if (!isMultiLine) {
        return {
            label: 'Volver a conectar', variant: 'outline' as const, disabled: false, strong: false,
            note: 'Sirve para renovar el permiso. Si inicias sesión con otro número, sustituye a este: el actual pasa a «Números anteriores» con sus conversaciones.',
        };
    }
    // En el límite (o por encima, si el plan bajó) no cabe otro número, pero
    // renovar el permiso de uno conectado sí: el botón se queda como «Volver a
    // conectar», y si se elige un número nuevo, el backend responde con el
    // límite (revisión de Codex del PR #21; el diseño lo apagaba).
    if (activeCount > maxLines) {
        return {
            label: 'Volver a conectar', variant: 'outline' as const, disabled: false, strong: true,
            note: `Tu plan ahora permite ${plural(maxLines, 'línea conectada', 'líneas conectadas')}. Las ${activeCount} siguen funcionando con normalidad; solo no puedes conectar otra. Volver a conectar un número ya conectado renueva su permiso.`,
        };
    }
    if (activeCount === maxLines) {
        return {
            label: 'Volver a conectar', variant: 'outline' as const, disabled: false, strong: true,
            note: `Tu plan permite ${plural(maxLines, 'línea conectada', 'líneas conectadas')}. Desconecta una antes de conectar otra, o pide más líneas. Volver a conectar un número ya conectado renueva su permiso.`,
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
/** Mientras se espera a WhatsApp, el estado cambia con la hora (reintentar a la media hora, el plazo de 24 h), no por un aviso. */
const WAITING_STATUSES = new Set(['requested', 'pending', 'failed']);
const WAITING_REFRESH_MS = 60_000;

/**
 * El estado de los chats de la app se ve cambiar sin recargar: con el aviso
 * `history_sync` y, mientras se espera a WhatsApp, cada minuto.
 */
const useHistorySyncRefresh = (activeLines: Line[]) => {
    const { subscribe } = useSSE();
    const refresh = useThrottledInvalidate(LINES_QUERY_KEY);
    useEffect(() => subscribe("history_sync", refresh), [subscribe, refresh]);

    const waiting = activeLines.some(line => line.historySync && WAITING_STATUSES.has(line.historySync.status));
    useEffect(() => {
        if (!waiting) return;
        const timer = setInterval(refresh, WAITING_REFRESH_MS);
        return () => clearInterval(timer);
    }, [waiting, refresh]);
};

export const LinesCard = () => {
    const { isLoading, isError, refresh, lines, activeLines, previousLines, removedLines, maxLines, isMultiLine, colorOf } = useLines();
    const connectWhatsapp = useConnectWhatsapp();
    useHistorySyncRefresh(activeLines);
    const [toDisconnect, setToDisconnect] = useState<Line | null>(null);
    // La pregunta antes de abrir Facebook (coexistencia). «Volver a conectar» una
    // línea que estaba junto con la app la abre ya en «Sí». `key` la reinicia.
    const [question, setQuestion] = useState<{ key: number; initialAnswer: 'yes' | null } | null>(null);
    const askBeforeConnecting = (initialAnswer: 'yes' | null = null) => setQuestion({ key: Date.now(), initialAnswer });
    // «Números anteriores»: las desconectadas desde Wasmish. Las que desconectó
    // Meta se quedan en la lista, con su aviso.
    const formerLines = previousLines.filter(line => !line.disconnectionReason);

    const connectError = connectWhatsapp.isError ? apiErrorOf(connectWhatsapp.error, 'No se pudo conectar WhatsApp. Intenta de nuevo.') : null;
    // Se reintenta lo que puede salir bien al repetirlo: otro cambio en curso, o WhatsApp que no activó el número.
    const canRetryConnect = Boolean(connectError)
        && (isBusy(connectError) || connectError?.code === LINE_ERROR.registrationFailed);
    const groups = groupByWaba(lines.filter(line => line.status === 'active' || line.disconnectionReason));
    const button = connectState({
        activeCount: activeLines.length, maxLines, isMultiLine, isConnecting: connectWhatsapp.isConnecting,
        hasRemoved: removedLines.length > 0,
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
                    {/* El estado y el botón dependen de las líneas: mientras cargan, «Sin conectar» sería falso. */}
                    {isLoading ? (
                        <SkeletonPill width="104px" />
                    ) : isMultiLine ? (
                        <span className="flex-none rounded-full bg-brand-bg px-3 py-1.5 font-mono text-[12.5px] font-semibold text-brand-strong tabular-nums">
                            {activeLines.length} de {plural(maxLines, 'línea', 'líneas')}
                        </span>
                    ) : (
                        <Pill tone={activeLines.length > 0 ? 'positive' : removedLines.length > 0 ? 'warning' : 'neutral'}
                            icon={<span className={`w-1.5 h-1.5 rounded-full ${activeLines.length > 0 ? 'bg-brand-success' : removedLines.length > 0 ? 'bg-brand-warning' : 'bg-brand-subtle'}`} />}>
                            {activeLines.length > 0 ? 'Conectado' : removedLines.length > 0 ? 'Desconectado' : 'Sin conectar'}
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
                                {canRetryConnect && (
                                    <button type="button" onClick={() => askBeforeConnecting()}
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

                {isLoading && (
                    <SettingsListSkeleton label="Cargando las líneas" rows={2}
                        avatar={LINE_SWATCH_SKELETON} rowClassName="px-[18px] py-4 max-sm:px-3.5" />
                )}
                {isError && (
                    <p className="text-sm text-brand-danger">
                        No se pudieron cargar las líneas.{' '}
                        <button type="button" onClick={refresh} className="font-semibold text-brand-accent-strong cursor-pointer">Reintentar</button>
                    </p>
                )}

                {!isLoading && !isError && activeLines.length === 0 && removedLines.length === 0 && (
                    <div className="grid gap-1.5 rounded-[10px] border border-dashed border-brand-border-strong p-7 max-sm:p-5">
                        <p className="text-[15px] font-semibold text-brand-text">Aún no hay ningún número conectado</p>
                        <p className="max-w-[520px] text-sm leading-[1.55] text-brand-gray-600">
                            Conecta tu número de WhatsApp Business para recibir y responder mensajes desde Wasmish. Se abre el
                            inicio de sesión de Facebook y las credenciales se configuran solas.
                        </p>
                    </div>
                )}

                {!isLoading && groups.length > 1 && (
                    <p className="-mb-2 text-[13px] text-brand-muted">Las líneas de una misma cuenta de WhatsApp Business comparten plantillas.</p>
                )}
                {!isLoading && groups.map(group => (
                    <div key={group.waBusinessId} className="rounded-[10px] border border-brand-border divide-y divide-brand-raised">
                        {groups.length > 1 && (
                            <div className="flex items-center gap-2.5 rounded-t-[10px] bg-brand-bg px-[18px] py-2 text-xs text-brand-muted">
                                <span className="font-mono font-semibold text-brand-strong">WABA {maskWabaId(group.waBusinessId)}</span>
                                <span className="ml-auto">{plural(group.lines.length, 'línea', 'líneas')}</span>
                            </div>
                        )}
                        {group.lines.map(line => (line.status === 'active'
                            ? <LineRow key={line.id} line={line} colorClass={colorOf(line.id)} showDefault={isMultiLine}
                                onDisconnect={setToDisconnect} />
                            : <RemovedLineRow key={line.id} line={line} showDefault={isMultiLine}
                                onReconnect={removed => askBeforeConnecting(removed.businessApp ? 'yes' : null)} />
                        ))}
                    </div>
                ))}

                {connectWhatsapp.isConnecting && (
                    <div className="flex items-center gap-3.5 rounded-[10px] border border-dashed border-brand-green-200 bg-brand-green-50 px-[18px] py-4">
                        <Loader2 size={18} className="flex-none animate-spin text-brand-accent-strong" />
                        <div className="min-w-0">
                            {/* Con la app de WhatsApp Business, el paso es escanear el código (1d, m3). */}
                            <p className="text-sm font-semibold text-brand-text">
                                {connectWhatsapp.businessApp ? 'Conectando tu número…' : 'Conectando un número nuevo…'}
                            </p>
                            <p className="mt-0.5 text-[13px] text-brand-gray-600">
                                {connectWhatsapp.businessApp
                                    ? 'En la ventana de Facebook, escanea el código desde la app de WhatsApp Business. Después Meta confirma el número: tarda unos segundos.'
                                    : 'Termina el inicio de sesión en la ventana de Facebook. Después Meta confirma el número: tarda unos segundos.'}
                            </p>
                        </div>
                    </div>
                )}

                {isLoading ? (
                    <SkeletonBox className="h-10 max-sm:h-12 w-full sm:w-[190px] rounded-[8px]" />
                ) : (
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="h-10 w-full sm:w-auto max-sm:h-12">
                            <CustomButton variant={button.variant} disabled={button.disabled}
                                onClick={() => askBeforeConnecting(activeLines.length === 0 && removedLines.some(line => line.businessApp) ? 'yes' : null)}>
                                <Plug size={16} />{button.label}
                            </CustomButton>
                        </div>
                        {button.note && (
                            <p className={`flex-1 min-w-[260px] text-[13px] leading-[1.55] ${button.strong ? 'text-brand-strong' : 'text-brand-muted'}`}>
                                {button.note}
                            </p>
                        )}
                    </div>
                )}

                <PreviousLines lines={formerLines} />
                <ManualCredentialsForm hasToken={activeLines.length > 0} />
            </div>

            <DisconnectLineDialog line={toDisconnect} onClose={() => setToDisconnect(null)} />
            {question && (
                <ConnectQuestion key={question.key} open initialAnswer={question.initialAnswer}
                    onCancel={() => setQuestion(null)}
                    onConnect={businessApp => { setQuestion(null); void connectWhatsapp.connect({ businessApp }); }} />
            )}
        </SettingsCard>
    );
};
