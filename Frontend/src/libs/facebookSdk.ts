const APP_ID = import.meta.env.VITE_META_APP_ID;
const GRAPH_VERSION = import.meta.env.VITE_META_GRAPH_VERSION;

let loaded = false;

// Carga el SDK de Facebook una sola vez y lo inicializa.
export const loadFacebookSdk = (): Promise<void> => {
    return new Promise((resolve) => {
        if (loaded) return resolve();

        // El SDK llamará a esta función cuando termine de cargar.
        window.fbAsyncInit = function () {
            window.FB.init({
                appId: APP_ID,
                autoLogAppEvents: true,
                xfbml: true,
                version: GRAPH_VERSION,
            });
            loaded = true;
            resolve();
        };

        // Evita inyectar el script dos veces.
        if (document.getElementById('facebook-jssdk')) return;

        const script = document.createElement('script');
        script.id = 'facebook-jssdk';
        script.src = 'https://connect.facebook.net/en_US/sdk.js';
        script.async = true;
        script.defer = true;
        script.crossOrigin = 'anonymous';
        document.body.appendChild(script);
    });
};
