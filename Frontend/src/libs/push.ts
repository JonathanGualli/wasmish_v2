import { registerServiceWorker } from './serviceWorker';
import { apiErrorOf } from '../utils/apiError';
import { deletePushSubscriptionService, savePushSubscriptionService, syncPushSubscriptionService } from '../services/api.service';

/**
 * Los avisos push en ESTE navegador:
 * - `unavailable`: el servidor no tiene claves VAPID (la tarjeta no se muestra);
 * - `unsupported`: el navegador no puede recibir avisos;
 * - `needs-install`: iPhone o iPad fuera de la app instalada (Safari solo avisa a la app de la pantalla de inicio);
 * - `denied`: la persona los bloqueó y el navegador ya no deja volver a preguntar;
 * - `off` / `on`.
 */
export type PushState = 'unavailable' | 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';

// Si la persona QUIERE avisos en este navegador. Distingue «los apagó» de «la
// suscripción desapareció sola» (Safari la pierde sin avisar): solo la segunda
// se recrea al abrir la app.
const ENABLED_KEY = 'wasmish.pushEnabled';

const readEnabled = () => {
    try {
        return localStorage.getItem(ENABLED_KEY) === '1';
    } catch {
        return false;
    }
};

const writeEnabled = (enabled: boolean) => {
    try {
        localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
    } catch {
        // Sin almacenamiento (modo privado): la preferencia no se recuerda.
    }
};

/** iPhone o iPad. Un iPad con «sitio de escritorio» dice ser un Mac, pero con pantalla táctil. */
export const isIos = () =>
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);

/** Safari de verdad: en iPhone, Chrome, Firefox y Edge no pueden añadir Wasmish a la pantalla de inicio. */
export const isIosSafari = () => isIos() && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);

/** Cómo se nombra el dispositivo en los textos: «este iPhone», «este celular», «esta compu». */
export type DeviceKind = 'iphone' | 'phone' | 'computer';

export const deviceKind = (): DeviceKind =>
    isIos() ? 'iphone' : /Android|Mobi/i.test(navigator.userAgent) ? 'phone' : 'computer';

/** El navegador, para decir dónde están bloqueados («Bloqueados en Chrome»); `null` si no se reconoce. */
export const browserName = (): string | null => {
    const ua = navigator.userAgent;
    if (/EdgiOS|Edg\//.test(ua)) return 'Edge';
    if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
    if (/OPR\/|OPiOS/.test(ua)) return 'Opera';
    if (/Firefox|FxiOS/.test(ua)) return 'Firefox';
    if (/Chrome|CriOS/.test(ua)) return 'Chrome';
    if (/Safari/.test(ua)) return 'Safari';
    return null;
};

/** Abierta como app instalada (desde su ícono), no en una pestaña del navegador. */
export const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

// Sube con cada activación y cada apagado. Una sincronización que ve que cambió
// mientras esperaba se descarta: si no, una que estaba creando la suscripción
// la dejaba viva después de apagarlos o de cerrar sesión (revisión de Codex del
// PR #45).
let generation = 0;

const isSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const urlBase64ToUint8Array = (base64: string) => {
    const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
};

const subscribe = (registration: ServiceWorkerRegistration, publicKey: string) =>
    registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });

// Para suscribirse hace falta el worker activo. Registrar otra vez devuelve el
// que ya hay, así no depende de que el `load` de main.tsx llegara antes.
const readyRegistration = async () => {
    if (!(await registerServiceWorker())) return null;
    return navigator.serviceWorker.ready;
};

// Para leer o cancelar basta el registro, sin esperar a `ready`: cerrar sesión
// no puede quedarse colgado si el worker nunca llegó a activarse.
const currentSubscription = async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return (await registration?.pushManager.getSubscription()) ?? null;
};

export const getPushState = async (publicKey: string | null): Promise<PushState> => {
    if (!publicKey) return 'unavailable';
    if (isIos() && !isStandalone()) return 'needs-install';
    if (!isSupported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    if (Notification.permission !== 'granted' || !readEnabled()) return 'off';
    return (await currentSubscription()) ? 'on' : 'off';
};

/**
 * Activar los avisos (desde un toque de la persona). Siempre estrena `endpoint`:
 * si el navegador ya tenía una suscripción, se cancela, sin borrarla en el
 * backend (el 410 lo hará). Así un aviso de otra persona que ya estaba saliendo
 * va al `endpoint` muerto y nunca a este (revisión de Codex del PR #42).
 */
export const enablePush = async (publicKey: string): Promise<PushState> => {
    // Lo primero y sin ningún `await` antes: Safari solo muestra el diálogo
    // dentro del toque. Con el permiso ya concedido no muestra nada.
    const permission = await Notification.requestPermission();
    if (permission === 'denied') return 'denied';
    if (permission !== 'granted') return 'off';

    generation += 1;
    writeEnabled(false);
    const registration = await readyRegistration();
    if (!registration) return 'unsupported';
    await (await registration.pushManager.getSubscription())?.unsubscribe();
    const subscription = await subscribe(registration, publicKey);
    await savePushSubscriptionService(subscription.toJSON());
    writeEnabled(true);
    return 'on';
};

/**
 * Apagar los avisos de este navegador (también al cerrar sesión). Primero se
 * cancela en el navegador: el `endpoint` muere en el servicio de push y, aunque
 * falle el DELETE, el dispositivo deja de recibir. Nunca rechaza.
 */
export const disablePush = async (): Promise<void> => {
    generation += 1;
    writeEnabled(false);
    if (!isSupported()) return;
    try {
        const subscription = await currentSubscription();
        if (!subscription) return;
        const { endpoint } = subscription;
        await subscription.unsubscribe();
        await deletePushSubscriptionService(endpoint);
    } catch {
        // Un 404 o sin red: el siguiente envío a ese `endpoint` da 410 y el backend lo borra.
    }
};

/**
 * Al abrir la app con sesión: si la persona quiere avisos y el navegador perdió
 * la suscripción (caducó, o Safari la tiró sin avisar), la crea otra vez, sin
 * toque porque el permiso ya está; y se la manda al backend. Nunca rechaza.
 */
export const syncPushSubscription = async (publicKey: string | null): Promise<void> => {
    if (!publicKey || !isSupported() || Notification.permission !== 'granted' || !readEnabled()) return;
    const started = generation;
    const stale = () => generation !== started;
    let subscription: PushSubscription | null = null;
    try {
        const registration = await readyRegistration();
        if (!registration || stale()) return;
        const existing = await registration.pushManager.getSubscription();
        subscription = existing ?? await subscribe(registration, publicKey);
        if (stale()) {
            // La creó esta sincronización y ya no la quiere nadie (las que ya
            // existían las cancela quien apagó o activó).
            if (!existing) await subscription.unsubscribe();
            return;
        }
        await syncPushSubscriptionService(subscription.toJSON());
    } catch (error) {
        // 409: la suscripción de este navegador es de otra persona, cuya sesión
        // caducó sin cerrarla. Quien está ahora aquí no debe ver sus avisos: se
        // cancela, y esta persona puede activar los suyos.
        if (subscription && apiErrorOf(error).code === 'push_owned_by_other') {
            writeEnabled(false);
            await subscription.unsubscribe().catch(() => false);
        }
        // Otro fallo (sin red): se reintenta la próxima vez que se abra la app.
    }
};
