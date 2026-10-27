import { ArrowDownToLine, Check, LoaderCircle, RefreshCw, Smartphone, type LucideIcon } from "lucide-react";
import type { HistorySync } from "../../../../models/line.model";

type Kind = 'wait' | 'go' | 'ok' | 'info' | 'retry';

interface Copy {
    kind: Kind;
    title: string;
    text: string;
}

const ICONS: Record<Kind, { Icon: LucideIcon; className: string }> = {
    wait: { Icon: LoaderCircle, className: 'text-brand-gray-600' },
    go: { Icon: ArrowDownToLine, className: 'text-brand-accent-strong' },
    ok: { Icon: Check, className: 'text-brand-success' },
    info: { Icon: Smartphone, className: 'text-brand-muted' },
    retry: { Icon: RefreshCw, className: 'text-brand-gray-600' },
};

const RECONNECT = 'Para traerlos, desconecta el número y vuelve a conectarlo. Al escanear el código, acepta compartirlos en la app.';
const HOUR_MS = 60 * 60 * 1000;

/** Las horas que quedan para reintentar, redondeadas hacia arriba: «18 h más». */
const hoursLeft = (retryUntil: string, now: number) => {
    const hours = Math.ceil((new Date(retryUntil).getTime() - now) / HOUR_MS);
    return hours <= 1 ? 'menos de una hora más' : `${hours} h más`;
};

/**
 * Qué dice la línea según el estado del backend (`historySyncView`). Los textos
 * son los del diseño «Wasmish Líneas - Chats de la app» (2a–2b), más el del
 * 100 % antes de terminar, que el diseño no tenía: Wasmish espera 10 minutos
 * sin trozos nuevos para darlos por terminados (decisión del 2026-10-26).
 */
const historySyncCopy = (sync: HistorySync, now = Date.now()): Copy => {
    switch (sync.status) {
        case 'requested':
        case 'pending':
            return sync.canRetry
                ? { kind: 'wait', title: 'Pedimos tus chats de la app a WhatsApp', text: 'Todavía no llega ninguno. Si el pedido no llegó a WhatsApp, puedes pedirlos otra vez.' }
                : { kind: 'wait', title: 'Pedimos tus chats de la app a WhatsApp', text: 'Suelen empezar a llegar en unos minutos. No tienes que hacer nada.' };
        case 'receiving':
            return sync.progress === 100
                ? { kind: 'go', title: 'Trayendo tus chats de la app', text: 'Ya llegaron. Esperamos unos minutos por si falta alguno; ya puedes usarlos en Chats.' }
                : { kind: 'go', title: 'Trayendo tus chats de la app', text: 'Van apareciendo en Chats mientras tanto.' };
        case 'done':
            return { kind: 'ok', title: 'Tus chats de la app ya están en Wasmish', text: 'Los de los últimos 6 meses. Algunas fotos recientes pueden tardar un poco más.' };
        case 'partial': {
            const count = sync.failedThreads;
            return {
                kind: 'ok', title: 'Tus chats de la app ya están en Wasmish',
                text: `Menos ${count} ${count === 1 ? 'chat que WhatsApp no mandó; sigue' : 'chats que WhatsApp no mandó; siguen'} en tu celular.`,
            };
        }
        case 'declined':
            return { kind: 'info', title: 'Tus chats de la app se quedaron en el celular', text: `No se aceptó compartirlos al escanear el código. ${RECONNECT}` };
        case 'none':
            return { kind: 'info', title: 'No llegó ningún chat de la app', text: 'Quizá en el celular no había. Lo que te escriban desde ahora llega a Chats como siempre.' };
        case 'failed':
            return sync.canRetry
                ? { kind: 'retry', title: 'No pudimos pedir tus chats de la app', text: `Puedes intentarlo otra vez durante ${hoursLeft(sync.retryUntil, now)}.` }
                : { kind: 'info', title: 'Tus chats de la app se quedaron en el celular', text: `Ya pasó el día que había para pedirlos. ${RECONNECT}` };
    }
};

/**
 * Lo que no dice el estado y sí se puede reintentar: Meta rechazó solo el
 * pedido de la agenda, con los chats llegando o ya terminados («Reintentar»
 * siempre que el backend lo permita, decisión del 2026-10-26).
 */
const contactsRetryNote = (sync: HistorySync) =>
    sync.canRetry && !['requested', 'pending', 'failed'].includes(sync.status)
        ? ' Los nombres de tu celular no llegaron: puedes pedirlos otra vez.'
        : '';

const Progress = ({ value, className }: { value: number; className: string }) => (
    <div className={`items-center gap-2.5 ${className}`}>
        <div className="flex-1 h-1.5 rounded-[3px] bg-brand-border overflow-hidden" role="progressbar"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label="Chats de la app traídos">
            <div className="h-full rounded-[3px] bg-brand-success transition-[width] duration-400 ease-out" style={{ width: `${value}%` }} />
        </div>
        <span className="flex-none min-w-[38px] text-right font-mono text-[12.5px] max-sm:text-[13px] font-semibold tabular-nums text-brand-accent-strong">
            {value} %
        </span>
    </div>
);

interface Props {
    sync: HistorySync;
    isRetrying: boolean;
    onRetry: () => void;
}

/**
 * Cómo van los chats de la app de una línea, en una frase bajo la línea: gris
 * tranquilo en todos los estados, sin ámbar ni rojo. Diseño «Wasmish Líneas -
 * Chats de la app» (2a, 2b y m2–m4): en el celular, la barra y «Reintentar» van
 * a lo ancho.
 */
export const LineHistoryStatus = ({ sync, isRetrying, onRetry }: Props) => {
    const copy = historySyncCopy(sync);
    const { Icon, className } = ICONS[copy.kind];
    const progress = copy.kind === 'go' ? sync.progress ?? 0 : null;

    return (
        <div className="sm:ml-6 flex max-sm:flex-col sm:items-start gap-3 rounded-[10px] border border-brand-raised bg-brand-bg px-3.5 py-3 max-sm:py-3.5">
            <div className="flex-1 min-w-0 flex items-start gap-3 max-sm:gap-2.5">
                <span className={`flex-none flex pt-px max-sm:pt-0.5 ${className}`}>
                    <Icon size={16} strokeWidth={copy.kind === 'wait' || copy.kind === 'ok' ? 2.4 : 2} className="max-sm:w-[17px] max-sm:h-[17px]" />
                </span>
                <div className="flex-1 min-w-0 grid gap-[3px] max-sm:gap-1" aria-live="polite">
                    <p className="text-sm max-sm:text-[15px] font-semibold text-brand-text">{copy.title}</p>
                    <p className="text-[13px] max-sm:text-sm leading-[1.55] text-brand-gray-600 text-pretty">{copy.text}{contactsRetryNote(sync)}</p>
                    {progress !== null && <Progress value={progress} className="mt-1.5 max-sm:hidden flex" />}
                </div>
            </div>
            {progress !== null && <Progress value={progress} className="sm:hidden flex" />}
            {sync.canRetry && (
                <button type="button" onClick={onRetry} disabled={isRetrying}
                    className="flex-none inline-flex items-center justify-center gap-[7px] h-[34px] max-sm:h-12 max-sm:w-full px-[13px]
                        rounded-[9px] max-sm:rounded-[10px] border border-brand-border-strong bg-brand-surface text-[13.5px] max-sm:text-[15px]
                        font-semibold text-brand-accent-strong whitespace-nowrap hover:bg-brand-bg transition-colors cursor-pointer
                        disabled:cursor-default disabled:text-brand-subtle">
                    {isRetrying ? 'Pidiendo…' : 'Reintentar'}
                </button>
            )}
        </div>
    );
};
