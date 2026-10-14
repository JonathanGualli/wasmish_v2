/**
 * Registra el service worker de la app móvil (`public/sw.js`): hace la app
 * instalable y muestra los avisos push. `null` si el navegador no lo admite o
 * si falla el registro (la app funciona igual, sin avisos).
 */
export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
    if (!('serviceWorker' in navigator)) return null;
    try {
        return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    } catch (error) {
        console.error('No se pudo registrar el service worker:', error);
        return null;
    }
};
