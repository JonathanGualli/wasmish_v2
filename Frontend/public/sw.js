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

// Con Wasmish abierto, lo enfoca y le pide que abra la conversación (sin
// recargar); si no, lo abre en ella.
const openFromNotification = async ({ url, conversationId }) => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (open) {
        await open.focus();
        if (conversationId) open.postMessage({ type: 'open-conversation', conversationId });
        return;
    }
    await self.clients.openWindow(url || CHATS_URL);
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
