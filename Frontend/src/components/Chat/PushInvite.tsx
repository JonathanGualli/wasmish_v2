import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ChevronRight, X } from "lucide-react";
import type { PushNotifications } from "../../hooks/usePushNotifications";
import { useInstallPrompt } from "../../hooks/useInstallPrompt";
import { deviceKind, iosInstallStepCount } from "../../libs/push";
import { dismissPushInvite, isPushInviteDismissed, retirePushInvite } from "../../libs/pushPrompts";
import { SettingsPath } from "../../models/routes.models";

const linkClass = "inline-flex items-center gap-0.5 text-sm font-semibold text-brand-accent-strong cursor-pointer hover:underline";

/**
 * La invitación a activar los avisos, arriba de la bandeja (diseño B1 y B2).
 * Solo en el celular y con los avisos sin activar: una fila en el flujo de la
 * lista, no un banner fijo. La × la calla 30 días en este dispositivo; al
 * activarlos desaparece para siempre. Ajustes sigue teniendo todo.
 */
export const PushInvite = ({ push }: { push: PushNotifications }) => {
    const { state, isWorking, error, enable } = push;
    const { canInstall, install } = useInstallPrompt();
    const navigate = useNavigate();
    const [dismissed, setDismissed] = useState(isPushInviteDismissed);

    useEffect(() => {
        if (state === 'on') retirePushInvite();
    }, [state]);

    if (deviceKind() === 'computer' || dismissed) return null;
    if (state !== 'off' && state !== 'needs-install' && state !== 'denied') return null;

    const toSettings = (label: string) => (
        <button type="button" onClick={() => navigate(SettingsPath)} className={linkClass}>
            {label} <ChevronRight size={15} />
        </button>
    );

    let text: ReactNode;
    let actions: ReactNode;
    if (state === 'needs-install') {
        text = 'Para recibir avisos en el iPhone, añade Wasmish a tu pantalla de inicio.';
        actions = toSettings(`Ver cómo, en ${iosInstallStepCount()} pasos`);
    } else if (state === 'denied') {
        text = 'Los avisos están bloqueados.';
        actions = toSettings('Ver cómo permitirlos');
    } else {
        text = error ? 'No pudimos activar los avisos. Revisa tu internet y vuelve a intentarlo.'
            : 'Entérate de cada mensaje aunque cierres Wasmish.';
        actions = (
            <>
                {isWorking
                    ? <span className="text-sm font-semibold text-brand-muted">Activando…</span>
                    : <button type="button" onClick={enable} className={linkClass}>{error ? 'Reintentar' : 'Activar avisos'}</button>}
                {canInstall && (
                    <button type="button" onClick={install}
                        className="text-sm font-semibold text-brand-gray-600 cursor-pointer hover:underline">
                        Instalar app
                    </button>
                )}
            </>
        );
    }

    return (
        <div className="mx-3 mt-3 mb-1 flex gap-3 rounded-xl border border-brand-green-200 bg-brand-green-50 pl-3.5 pr-2 py-3">
            <Bell size={18} className="flex-none mt-0.5 text-brand-accent-strong" />
            <div className="flex-1 min-w-0">
                <p className={`text-sm leading-[1.45] ${error && state === 'off' ? 'text-brand-danger' : 'text-brand-strong'}`}>{text}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">{actions}</div>
            </div>
            <button
                type="button"
                onClick={() => { dismissPushInvite(); setDismissed(true); }}
                aria-label="No mostrar por ahora"
                title="No mostrar por ahora"
                className="flex-none self-start w-8 h-8 -mt-1 rounded-lg flex items-center justify-center
                    text-brand-muted hover:bg-brand-green-100 hover:text-brand-text cursor-pointer transition-colors"
            >
                <X size={16} />
            </button>
        </div>
    );
};
