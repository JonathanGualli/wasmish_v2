import { useState, type ReactNode } from "react";
import {
    AlertCircle, Bell, BellOff, Check, Copy, Download, Eye, LoaderCircle, LogOut, Monitor, RefreshCw,
    SlidersHorizontal, Smartphone,
} from "lucide-react";
import { CustomButton } from "../../../components/Button/Button";
import { Callout } from "../../../components/Callout/Callout";
import { SectionTitle } from "../../../components/Page/PageShell";
import { IosInstallSteps } from "../../../components/Push/IosInstallSteps";
import { NumberedSteps, type NumberedStep } from "../../../components/Push/NumberedSteps";
import { usePushNotifications } from "../../../hooks/usePushNotifications";
import { useInstallPrompt } from "../../../hooks/useInstallPrompt";
import { useCopyToClipboard } from "../../../hooks/useCopyToClipboard";
import { browserName, deviceKind, type DeviceKind, type PushFailure, type PushState } from "../../../libs/push";
import { SettingsCard } from "./SettingsCard";

/**
 * Ajustes → los avisos y la instalación en ESTE dispositivo (diseño «Wasmish
 * Móvil - App instalable y avisos», § 1). En el celular, una tarjeta por cosa
 * (A1–A8); en la compu, una sección con una fila por cosa (A9). Va primero en
 * Ajustes porque es lo único que depende del dispositivo. Sin claves VAPID en
 * el servidor no se enseña nada.
 */

const NOUN: Record<DeviceKind, string> = { iphone: 'este iPhone', phone: 'este celular', computer: 'esta compu' };

const strong = (text: string) => <strong className="text-brand-text">{text}</strong>;

const statusLabel = (state: PushState, kind: DeviceKind) => {
    switch (state) {
        case 'on': return 'Activos';
        case 'denied': return kind === 'iphone' ? 'Bloqueados en el iPhone' : `Bloqueados en ${browserName() ?? 'este navegador'}`;
        case 'unsupported': return 'No disponibles en este navegador';
        case 'needs-install': return 'Primero, añade Wasmish al inicio';
        default: return 'Apagados';
    }
};

const Status = ({ state, kind }: { state: PushState; kind: DeviceKind }) => (
    <span className={`text-[13px] ${state === 'on' ? 'text-brand-success font-semibold'
        : state === 'denied' ? 'text-brand-danger font-semibold' : 'text-brand-muted'}`}>
        {state === 'on' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-success mr-1.5 align-middle" />}
        {statusLabel(state, kind)}
    </span>
);

const StateIcon = ({ state }: { state: PushState }) => {
    const blocked = state === 'denied' || state === 'unsupported';
    const tone = state === 'on' ? 'bg-brand-accent-soft text-brand-accent-strong'
        : state === 'denied' ? 'bg-brand-danger-soft text-brand-danger'
            : 'bg-brand-raised text-brand-muted';
    return (
        <span className={`flex-none w-10 h-10 rounded-[10px] flex items-center justify-center ${tone}`}>
            {blocked ? <BellOff size={20} /> : <Bell size={20} />}
        </span>
    );
};

/** Las tres verdades del diseño: por dispositivo, nombre y texto visibles, y cerrar sesión los apaga. */
const Facts = ({ kind }: { kind: DeviceKind }) => (
    <ul className="flex flex-col gap-2.5 pt-4 border-t border-brand-border text-[13px] leading-[1.5] text-brand-muted">
        <li className="flex gap-2.5">
            {kind === 'computer' ? <Monitor size={15} className="flex-none mt-0.5" /> : <Smartphone size={15} className="flex-none mt-0.5" />}
            Solo en {NOUN[kind]}. {kind === 'computer' ? 'En el celular se activan aparte.' : 'En la compu se activan aparte.'}
        </li>
        <li className="flex gap-2.5">
            <Eye size={15} className="flex-none mt-0.5" />
            El aviso muestra el nombre y el texto, también con el teléfono bloqueado.
        </li>
        <li className="flex gap-2.5">
            <LogOut size={15} className="flex-none mt-0.5" />
            Al cerrar sesión, {NOUN[kind]} deja de recibirlos.
        </li>
    </ul>
);

/** Cómo se ve un aviso (A1): el ícono de la app, un contacto y su mensaje. */
const SamplePush = () => (
    <div className="flex gap-3 items-center rounded-[10px] bg-brand-bg px-3 py-2.5">
        <img src="/brand/app-icon-192.png" alt="" className="w-7 h-7 rounded-[7px] flex-none" />
        <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-brand-text">María López</p>
            <p className="text-[13px] text-brand-strong truncate">¿Tienen turno para mañana?</p>
        </div>
        <span className="self-start text-[11px] text-brand-subtle">ahora</span>
    </div>
);

const blockedSteps = (kind: DeviceKind): NumberedStep[] => {
    const host = strong(window.location.host);
    if (kind === 'iphone') return [
        { content: <>Abre {strong('Ajustes')} del iPhone (el engranaje gris).</> },
        { content: <>{strong('Notificaciones → Wasmish →')} enciende {strong('Permitir notificaciones')}.</> },
        { content: <>Vuelve a Wasmish desde su ícono.</> },
    ];
    const icon = <SlidersHorizontal size={14} className="inline-block align-[-2px] mx-0.5 text-brand-muted" />;
    if (kind === 'computer') return [
        { content: <>Toca el ícono {icon} a la izquierda de {host}, en la barra de direcciones.</> },
        { content: <>Busca {strong('Notificaciones')} y elige {strong('Permitir')}.</> },
        { content: <>Vuelve aquí y toca {strong('Ya lo permití')}.</> },
    ];
    return [
        { content: <>Toca el ícono {icon} a la izquierda de {host}, arriba.</> },
        { content: <>Entra en {strong('Permisos → Notificaciones')} y elige {strong('Permitir')}.</> },
        { content: <>Vuelve aquí y toca {strong('Ya lo permití')}.</> },
    ];
};

// El ajuste de Brave que deja pasar los avisos (lo trae apagado).
const BRAVE_PUSH_SETTING = '«Usar los servicios de Google para la mensajería push»';

/**
 * Por qué no se activaron (A4). El diseño solo traía el fallo de Wasmish; si
 * falla el navegador, decir «revisa tu internet» manda a buscar donde no es.
 */
const failureMessage = (failure: PushFailure, kind: DeviceKind): ReactNode => {
    if (failure === 'server') return <>
        {strong('No pudimos activarlos.')} El permiso está dado; falló la conexión con Wasmish.
        Revisa tu internet y vuelve a intentarlo.
    </>;
    const browser = browserName();
    if (browser === 'Brave') return <>
        {strong('Brave no pudo activarlos.')} Trae apagado el servicio de avisos que usan las páginas.
        {kind === 'computer'
            ? <> Abre <span className="font-mono text-[13px]">brave://settings/privacy</span>, enciende {BRAVE_PUSH_SETTING} y vuelve a intentarlo.</>
            : <> En su configuración, en {strong('Privacidad y seguridad')}, enciende {BRAVE_PUSH_SETTING} y vuelve a intentarlo.</>}
    </>;
    return <>
        {strong(`${kind === 'iphone' ? 'El iPhone' : browser ?? 'Tu navegador'} no pudo activarlos.`)} Falló su servicio de avisos, no Wasmish.
        {kind === 'iphone' ? ' Vuelve a intentarlo en un rato.' : ' Vuelve a intentarlo en un rato; si sigue, prueba con otro navegador.'}
    </>;
};

const SUPPORTED_BROWSERS: [string, string][] = [
    ['Android', 'Chrome, Edge o Samsung Internet'],
    ['iPhone', 'Safari, añadida a la pantalla de inicio'],
    ['Compu', 'Chrome, Edge, Firefox o Safari'],
];

/** Lo que cambia de un estado a otro: el texto, lo de debajo y la acción. La cabecera es siempre la misma. */
interface StateView {
    text?: ReactNode;
    detail?: ReactNode;
    action?: ReactNode;
    /** Las tres verdades (apagados y activos). */
    facts?: boolean;
}

export const PushNotificationsCard = () => {
    const { state, isWorking, error, enable, disable } = usePushNotifications();
    const { canInstall, install } = useInstallPrompt();
    const { copied, copy } = useCopyToClipboard(2000);
    // «Ya lo permití» con el permiso aún bloqueado no cambia nada a la vista: decirlo.
    const [retriedBlocked, setRetriedBlocked] = useState(false);
    const kind = deviceKind();
    const isComputer = kind === 'computer';

    if (state === null || state === 'unavailable') return null;

    const fullButton = (button: ReactNode) => <div className="h-12">{button}</div>;
    const buttonFor = (button: ReactNode) => isComputer ? <div className="h-10 w-full sm:w-auto">{button}</div> : fullButton(button);

    const activating = isWorking && state !== 'on';
    const activateButton = activating ? (
        <>
            {buttonFor(
                <CustomButton disabled>
                    <LoaderCircle size={18} className="animate-spin" /> Activando…
                </CustomButton>,
            )}
            <p className="mt-2 text-[13px] text-brand-muted text-center">
                Toca {strong('Permitir')} en el aviso {isComputer ? 'del navegador' : 'del teléfono'}.
            </p>
        </>
    ) : buttonFor(<CustomButton onClick={enable}><Bell size={17} /> Activar avisos</CustomButton>);

    const views: Record<Exclude<PushState, 'unavailable'>, StateView> = {
        off: error ? {
            detail: (
                <Callout tone="danger" icon={<AlertCircle size={16} />}>
                    {failureMessage(error, kind)}
                </Callout>
            ),
            action: activating ? activateButton : buttonFor(<CustomButton onClick={enable}><RefreshCw size={16} /> Reintentar</CustomButton>),
        } : {
            text: isComputer
                ? 'Suena aunque la pestaña esté cerrada; muestra nombre y texto. Activarlos aquí no los activa en tu celular. Al cerrar sesión, se apagan.'
                : 'Que te suene el celular cuando llega un mensaje, aunque Wasmish esté cerrada. Tocar el aviso abre esa conversación.',
            detail: isComputer ? undefined : <SamplePush />,
            action: activateButton,
            facts: !isComputer,
        },
        on: {
            text: `${isComputer ? 'Esta compu recibe' : 'Este dispositivo recibe'} avisos de mensajes nuevos de las conversaciones que puedes ver.`,
            action: buttonFor(
                <CustomButton variant="outline" onClick={disable} isLoading={isWorking}>
                    <BellOff size={16} /> Apagar avisos
                </CustomButton>,
            ),
            facts: !isComputer,
        },
        denied: {
            text: kind === 'iphone'
                ? 'Elegiste «No permitir» y el iPhone ya no nos deja volver a preguntar. Actívalos desde los ajustes del teléfono:'
                : `Elegiste «Bloquear» y ${browserName() ?? 'el navegador'} ya no nos deja volver a preguntar. Puedes permitirlos tú en un minuto:`,
            detail: <NumberedSteps steps={blockedSteps(kind)} />,
            action: (
                <>
                    {fullButton(
                        <CustomButton onClick={() => { setRetriedBlocked(true); enable(); }} isLoading={isWorking}>
                            Ya lo permití
                        </CustomButton>,
                    )}
                    {retriedBlocked && !isWorking && (
                        <p className="mt-2 text-[13px] text-brand-danger text-center">
                            Siguen bloqueados: revisa el paso 2.
                        </p>
                    )}
                    {kind === 'phone' && (
                        <p className="mt-4 text-[13px] leading-[1.5] text-brand-muted">
                            ¿Wasmish está instalada? Mantén presionado su ícono → {strong('Información de la app')} → {strong('Notificaciones')}.
                        </p>
                    )}
                </>
            ),
        },
        unsupported: {
            text: 'Este navegador no puede recibir avisos. Abre Wasmish en uno de estos:',
            detail: (
                <dl className="rounded-[10px] border border-brand-border text-sm">
                    {SUPPORTED_BROWSERS.map(([device, browsers]) => (
                        <div key={device} className="flex gap-3 px-3.5 py-2.5 border-b border-brand-border last:border-b-0">
                            <dt className="w-[76px] flex-none font-semibold text-brand-text">{device}</dt>
                            <dd className="text-brand-strong">{browsers}</dd>
                        </div>
                    ))}
                </dl>
            ),
            action: fullButton(
                <CustomButton variant="outline" onClick={() => void copy(window.location.origin)}>
                    {copied ? <><Check size={16} /> Enlace copiado</> : <><Copy size={16} /> Copiar enlace de Wasmish</>}
                </CustomButton>,
            ),
        },
        'needs-install': { detail: <IosInstallSteps /> },
    };
    const view = views[state];
    // En la compu, lo sencillo (activar, apagar) va a la derecha de la fila; lo que lleva pasos, debajo.
    const actionAside = isComputer && !view.detail;

    if (isComputer) {
        return (
            <SettingsCard>
                <SectionTitle description="Lo que actives aquí solo vale para esta compu.">Este dispositivo</SectionTitle>
                <div className="rounded-xl border border-brand-border">
                    <div className="flex flex-col sm:flex-row gap-4 p-5">
                        <StateIcon state={state} />
                        <div className="flex-1 min-w-0 flex flex-col gap-3">
                            <div>
                                <p className="text-[15px] font-semibold text-brand-text">
                                    Avisos de mensajes nuevos <span className="font-normal text-brand-muted">·</span> <Status state={state} kind={kind} />
                                </p>
                                {view.text && <p className="mt-1 text-sm leading-[1.5] text-brand-strong">{view.text}</p>}
                            </div>
                            {view.detail}
                            {!actionAside && view.action && <div className="max-w-[320px]">{view.action}</div>}
                        </div>
                        {actionAside && <div className="flex-none sm:self-center">{view.action}</div>}
                    </div>
                    {canInstall && (
                        <div className="flex flex-col sm:flex-row gap-4 p-5 border-t border-brand-border">
                            <img src="/brand/app-icon-192.png" alt="" className="w-10 h-10 rounded-[10px] flex-none" />
                            <div className="flex-1 min-w-0">
                                <p className="text-[15px] font-semibold text-brand-text">Instalar Wasmish</p>
                                <p className="mt-1 text-sm text-brand-strong">En su propia ventana, con acceso desde el escritorio o la barra de tareas.</p>
                            </div>
                            <div className="flex-none sm:self-center h-10">
                                <CustomButton variant="outline" onClick={install}><Download size={16} /> Instalar</CustomButton>
                            </div>
                        </div>
                    )}
                </div>
            </SettingsCard>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <section className="rounded-xl border border-brand-border bg-brand-surface p-[18px] flex flex-col gap-4">
                <div className="flex gap-3 items-center">
                    <StateIcon state={state} />
                    <div className="min-w-0">
                        <h2 className="text-base font-semibold text-brand-text">Avisos en este dispositivo</h2>
                        <Status state={state} kind={kind} />
                    </div>
                </div>
                {view.text && <p className="text-[15px] leading-[1.5] text-brand-strong">{view.text}</p>}
                {view.detail}
                {view.action && <div>{view.action}</div>}
                {view.facts && <Facts kind={kind} />}
            </section>
            {canInstall && (
                <section className="rounded-xl border border-brand-border bg-brand-surface p-[18px] flex gap-3 items-center">
                    <img src="/brand/app-icon-192.png" alt="" className="w-10 h-10 rounded-[10px] flex-none" />
                    <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-semibold text-brand-text">Instalar Wasmish</p>
                        <p className="text-[13px] text-brand-muted">Con su ícono, a pantalla completa.</p>
                    </div>
                    <div className="flex-none h-10">
                        <CustomButton variant="outline" onClick={install}><Download size={16} /> Instalar</CustomButton>
                    </div>
                </section>
            )}
        </div>
    );
};
