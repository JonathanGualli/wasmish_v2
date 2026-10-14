import type { AxiosError } from "axios";
import { AlertCircle, Check, Copy, Eye, Loader2 } from "lucide-react";
import type { Line } from "../../../../models/line.model";
import { useCopyToClipboard } from "../../../../hooks/useCopyToClipboard";
import { useLinePin } from "../../../../hooks/useLinePin";

const WITH_PIN = 'Te lo pedirá WhatsApp si te llevas este número a otro proveedor o a la app de WhatsApp Business.';
const WITHOUT_PIN = 'Este número ya estaba activo en WhatsApp cuando lo conectaste. Su PIN lo tiene quien lo activó.';

// Sin respuesta del servidor es la conexión; con respuesta, el servidor.
const loadErrorMessage = (error: unknown) => ((error as AxiosError)?.response
    ? 'Algo falló al cargar el PIN. Inténtalo de nuevo.'
    : 'No se pudo cargar el PIN. Comprueba tu conexión.');

/** «482 913»: se lee mejor en dos mitades; se copia sin el espacio. */
const formatPin = (pin: string) => `${pin.slice(0, 3)} ${pin.slice(3)}`;

const Masked = ({ dim = false }: { dim?: boolean }) => (
    <span className={`font-mono text-[13px] tracking-[0.08em] ${dim ? 'text-brand-subtle' : 'text-brand-muted'}`}>••• •••</span>
);

/**
 * El PIN de dos pasos de una línea, dentro de sus «Detalles» (diseño: «Wasmish
 * Líneas - PIN de dos pasos»). Llega oculto y se pide al servidor con «Mostrar»;
 * no se guarda en la caché, así que se vuelve a ocultar al cerrar «Detalles» o
 * salir de Ajustes. Con roles (Fase 3), solo para el owner y los administradores.
 */
export const LinePin = ({ line }: { line: Line }) => {
    const { pin, isLoading, error, isMissing, reveal, hide } = useLinePin(line.id);
    const { copied, copy } = useCopyToClipboard();

    // Si el backend no lo tiene (o dejó de tenerlo entre la lista y la petición), se dice igual que sin PIN.
    const hasPin = line.hasTwoStepPin && !isMissing;

    return (
        <div className="sm:col-span-3 grid items-start gap-x-4 gap-y-2 border-t border-brand-border pt-3
            sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-muted">PIN de dos pasos</dt>
                <dd className="mt-1 flex min-h-[22px] flex-wrap items-center gap-x-2.5 gap-y-1" aria-live="polite">
                    {!hasPin && <span className="text-[13px] text-brand-gray-600">Sin PIN guardado</span>}

                    {hasPin && isLoading && (
                        <>
                            <Masked dim />
                            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-muted">
                                <Loader2 size={14} className="animate-spin" />Cargando…
                            </span>
                        </>
                    )}

                    {hasPin && !isLoading && pin === null && (
                        <>
                            <Masked />
                            <button type="button" onClick={reveal}
                                className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-accent-strong cursor-pointer">
                                <Eye size={14} />Mostrar
                            </button>
                        </>
                    )}

                    {hasPin && pin !== null && (
                        <>
                            <span className="font-mono text-[15px] font-semibold tracking-[0.06em] text-brand-text tabular-nums">
                                {formatPin(pin)}
                            </span>
                            {copied ? (
                                <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-accent-strong">
                                    <Check size={14} />Copiado
                                </span>
                            ) : (
                                <button type="button" onClick={() => copy(pin)} title="Copiar" aria-label="Copiar el PIN"
                                    className="flex text-brand-accent-strong cursor-pointer">
                                    <Copy size={14} />
                                </button>
                            )}
                            <button type="button" onClick={hide}
                                className="text-[12.5px] font-semibold text-brand-gray-600 hover:text-brand-text transition-colors cursor-pointer">
                                Ocultar
                            </button>
                        </>
                    )}
                </dd>
            </div>
            <dd className="pt-px text-[12.5px] leading-[1.5] text-brand-muted">{hasPin ? WITH_PIN : WITHOUT_PIN}</dd>

            {hasPin && error && (
                <dd role="alert" className="sm:col-span-2 flex flex-wrap items-center gap-2 text-[13px] text-brand-danger">
                    <AlertCircle size={14} className="flex-none" />
                    <span>{loadErrorMessage(error)}</span>
                    <button type="button" onClick={reveal}
                        className="font-semibold text-brand-accent-strong cursor-pointer">Reintentar</button>
                </dd>
            )}
        </div>
    );
};
