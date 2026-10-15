import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { CustomButton } from "../Button/Button";
import type { PushNotifications } from "../../hooks/usePushNotifications";
import { isIos, isStandalone } from "../../libs/push";
import { markPushSheetShown, wasPushSheetShown } from "../../libs/pushPrompts";

/**
 * «Último paso» (diseño C4): la única hoja que se abre sola, y una sola vez. Al
 * entrar por primera vez en la app instalada del iPhone con los avisos sin
 * activar, porque la persona llegó hasta aquí justamente para esto. «Ahora no»
 * la cierra y queda la invitación de la bandeja.
 */
export const ActivatePushSheet = ({ push }: { push: PushNotifications }) => {
    const { state, isWorking, enable } = push;
    const [wanted, setWanted] = useState(() => isIos() && isStandalone() && !wasPushSheetShown());
    const open = wanted && state === 'off';
    const started = useRef(false);

    useEffect(() => {
        if (open) markPushSheetShown();
    }, [open]);

    // Cuando termina de activar (con el resultado que sea), la hoja se cierra:
    // lo que haya pasado ya lo dicen Ajustes y la invitación.
    useEffect(() => {
        if (started.current && !isWorking) setWanted(false);
    }, [isWorking]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setWanted(false); };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end bg-brand-ink/50" onClick={() => setWanted(false)}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="activate-push-title"
                onClick={event => event.stopPropagation()}
                className="w-full rounded-t-2xl bg-brand-surface px-[22px] pt-2.5 pb-[max(20px,env(safe-area-inset-bottom))]"
            >
                <div className="mx-auto mb-5 h-1 w-9 rounded-full bg-brand-border-strong" />
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-accent-strong">Último paso</p>
                <h2 id="activate-push-title" className="mt-2 text-[22px] font-bold leading-[1.25] tracking-[-0.02em] text-brand-text">
                    Activa los avisos en este iPhone
                </h2>
                <p className="mt-3 text-[15px] leading-[1.55] text-brand-strong">
                    El iPhone te preguntará una sola vez. Toca <strong className="text-brand-text">Permitir</strong>: si
                    eliges «No permitir», tendrás que activarlos desde los ajustes del teléfono.
                </p>
                <p className="mt-3 text-[13px] leading-[1.5] text-brand-muted">
                    Solo en este iPhone · muestran nombre y texto con el teléfono bloqueado · al cerrar sesión dejan de llegar.
                </p>
                <div className="mt-5 h-12">
                    <CustomButton onClick={() => { started.current = true; enable(); }} isLoading={isWorking}>
                        <Bell size={17} /> Activar avisos
                    </CustomButton>
                </div>
                <div className="mt-2 h-11">
                    <CustomButton variant="ghost" onClick={() => setWanted(false)}>Ahora no</CustomButton>
                </div>
            </div>
        </div>
    );
};
