import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPushConfigService } from "../services/api.service";
import { disablePush, enablePush, getPushState, type PushState } from "../libs/push";
import { apiErrorOf } from "../utils/apiError";

export const PUSH_CONFIG_QUERY_KEY = ['pushConfig'];

/**
 * Los avisos push de este navegador: en qué estado están, y activarlos o
 * apagarlos. `state` es `null` mientras se averigua.
 */
export const usePushNotifications = () => {
    const { data: config } = useQuery({
        queryKey: PUSH_CONFIG_QUERY_KEY,
        queryFn: getPushConfigService,
        staleTime: Infinity,
    });
    const publicKey = config?.publicKey ?? null;
    const [state, setState] = useState<PushState | null>(null);
    const [isWorking, setIsWorking] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (config) setState(await getPushState(config.publicKey));
    }, [config]);

    // Nada se espera antes de `enablePush`: tiene que pedir el permiso dentro
    // del toque (ver `libs/push.ts`). «Ya lo permití» (diseño A5) también es
    // esto: con el permiso ya concedido activa sin diálogo, y si sigue
    // bloqueado el navegador responde `denied` sin preguntar.
    const enable = async () => {
        if (!publicKey) return;
        setIsWorking(true);
        setError(null);
        try {
            setState(await enablePush(publicKey));
        } catch (err) {
            setError(apiErrorOf(err).message);
            setState(await getPushState(publicKey));
        } finally {
            setIsWorking(false);
        }
    };

    const disable = async () => {
        setIsWorking(true);
        setError(null);
        await disablePush();
        setState(await getPushState(publicKey));
        setIsWorking(false);
    };

    useEffect(() => {
        void refresh();
    }, [refresh]);

    // Al volver a la pestaña o a la app (por ejemplo, de permitirlos en los
    // ajustes del teléfono) se vuelve a comprobar; si estaban bloqueados y ahora
    // están permitidos, se activan solos (diseño A5).
    const latest = useRef({ state, enable });
    useEffect(() => {
        latest.current = { state, enable };
    });
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState !== 'visible') return;
            const unblocked = latest.current.state === 'denied' && 'Notification' in window && Notification.permission === 'granted';
            if (unblocked) void latest.current.enable();
            else void refresh();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [refresh]);

    return {
        state,
        isWorking,
        /** Por qué falló el último intento de activar (diseño A4). */
        error,
        enable: () => { void enable(); },
        disable: () => { void disable(); },
    };
};

/** Lo que devuelve el hook: la bandeja lo comparte entre la invitación y la hoja «Último paso». */
export type PushNotifications = ReturnType<typeof usePushNotifications>;
