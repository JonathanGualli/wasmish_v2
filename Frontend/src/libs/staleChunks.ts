// Cuándo se recargó por última vez por un trozo que faltaba (`sessionStorage`).
const RELOADED_AT_KEY = 'wasmish:stale-chunk-reload';
// Si vuelve a faltar antes de esto, recargar no lo arregla: no hay bucle.
const RELOAD_COOLDOWN_MS = 60_000;

const lastReload = () => {
    try {
        return Number(sessionStorage.getItem(RELOADED_AT_KEY)) || 0;
    } catch {
        return 0;
    }
};

/**
 * Las páginas se descargan al entrar en ellas (`lazy` en `PrivateRouter`), en
 * archivos con el hash en el nombre. Tras un despliegue, los de la versión
 * anterior ya no están en el servidor: una pestaña (o la app del celular)
 * abierta desde antes que entra a una página que no había cargado falla al
 * pedirla. Vite lo avisa con `vite:preloadError`, y aquí se recarga para traer
 * la versión nueva, en vez de dejar la pantalla en blanco.
 *
 * Una sola vez por minuto: si el archivo falta también tras recargar (un
 * despliegue roto, sin conexión), el error sigue su curso.
 */
export const reloadOnStaleChunk = () => {
    window.addEventListener('vite:preloadError', (event) => {
        if (Date.now() - lastReload() < RELOAD_COOLDOWN_MS) return;
        try {
            sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
        } catch {
            // Sin storage no hay forma de saber si ya se recargó: mejor el
            // error que arriesgarse a un bucle.
            return;
        }
        event.preventDefault();
        window.location.reload();
    });
};
