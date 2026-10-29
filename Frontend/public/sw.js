// Service worker de Wasmish (app móvil). Hace tres cosas y nada más:
//   1. que la app se pueda instalar;
//   2. mostrar el aviso de un mensaje nuevo (push), aunque la app esté cerrada;
//   3. abrir la conversación al tocar el aviso.
//
// SIN caché y sin manejador de `fetch` a propósito: los datos son en vivo, y
// cachear el frontend dejaría al celular con una versión vieja tras un despliegue.
//
// Toda la cadena asíncrona de cada evento va dentro de `event.waitUntil()`: si
// no, el navegador puede parar el worker antes de terminar (sobre todo con la
// app cerrada), y el aviso no sale o el toque no abre nada.

const CHATS_URL = '/private/chats';
const FALLBACK = { title: 'Wasmish', body: 'Tienes un mensaje nuevo', url: CHATS_URL, conversationId: null };

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

const readPush = (event) => {
    try {
        return { ...FALLBACK, ...event.data.json() };
    } catch {
        return FALLBACK;
    }
};

// Cada push muestra su aviso, también con Wasmish en pantalla: si no, Chrome
// pone uno genérico suyo y Safari acaba retirando el permiso.
self.addEventListener('push', (event) => {
    const { title, body, url, conversationId } = readPush(event);
    event.waitUntil(self.registration.showNotification(title, {
        body,
        icon: '/brand/app-icon-192.png',
        badge: '/brand/app-badge-96.png',
        // Varios mensajes del mismo chat: un solo aviso, que vuelve a sonar.
        tag: conversationId ?? 'wasmish',
        renotify: true,
        data: { url, conversationId },
    }));
});

// Una ventana de la app con sesión: solo las de `/private/` escuchan
// `open-conversation` (PrivateLayout). Una página estática del mismo origen
// (`/privacidad.html`) o el login no lo harían, y el toque no abriría nada
// (revisión de Codex del PR #43).
const isAppWindow = (client) => {
    const url = new URL(client.url);
    return url.origin === self.location.origin && url.pathname.startsWith('/private/');
};

// Con Wasmish abierto, lo enfoca y le pide que abra la conversación (sin
// recargar); si no, lo abre en ella. Si enfocar falla (la ventana se cerró
// entretanto, o iOS lo rechaza al arrancar la app), también se abre en ella.
// Un aviso sin conversación (un rechazo, o te quitaron una que ya no ves) lleva
// a la bandeja: solo enfocar dejaría la app donde estaba (revisión de Codex del
// PR #163).
const openFromNotification = async ({ url, conversationId }) => {
    const target = url || CHATS_URL;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find(isAppWindow);
    if (open) {
        try {
            const focused = await open.focus();
            (focused ?? open).postMessage(conversationId ? { type: 'open-conversation', conversationId } : { type: 'open-chats' });
            return;
        } catch {
            // Cae a abrir la URL.
        }
    }
    await self.clients.openWindow(target);
};

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(openFromNotification(event.notification.data ?? {}));
});

const urlBase64ToUint8Array = (base64) => {
    const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
};

const applicationServerKey = async (oldSubscription) => {
    const fromOld = oldSubscription?.options?.applicationServerKey;
    if (fromOld) return fromOld;
    const response = await fetch('/api/push/config', { credentials: 'same-origin' });
    const { publicKey } = await response.json();
    return publicKey ? urlBase64ToUint8Array(publicKey) : null;
};

// El navegador renovó o perdió la suscripción (Chrome y Firefox lo avisan;
// Safari no): se manda la nueva al backend por `/sync`, que nunca cambia de
// dueño. Un fallo (sin sesión, 409) se ignora: la app la repara al abrirse.
const resubscribe = async (event) => {
    let subscription = event.newSubscription;
    if (!subscription) {
        const key = await applicationServerKey(event.oldSubscription);
        if (!key) return;
        subscription = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    }
    await fetch('/api/push/subscriptions/sync', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
    });
};

self.addEventListener('pushsubscriptionchange', (event) => {
    event.waitUntil(resubscribe(event).catch(() => {}));
});
