import { isIos } from './push';

// Lo que tiene que achicarse la parte visible para que sea el teclado (y no la
// barra del navegador al hacer scroll).
const KEYBOARD_MIN_PX = 120;

/**
 * El teclado del teléfono (diseño E3: el campo de escribir se pega a él).
 *
 * - En Android, `interactive-widget=resizes-content` (en `index.html`) achica la
 *   página con el teclado, y `100dvh` ya lo sigue.
 * - En iPhone, no: el teclado tapa la parte de abajo y Safari desplaza la página.
 *   Aquí la app mide lo que se ve (`visualViewport`) y lo pone en `--app-height`,
 *   que es el alto del layout (`PrivateLayout`), y la devuelve arriba.
 *
 * En los dos, `data-keyboard` en `<html>` quita el relleno de la barra de inicio,
 * que con el teclado abierto queda tapada.
 */
export const trackVisualViewport = () => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const ios = isIos();

    const update = () => {
        // Por la escala: con zoom (pellizcar) lo visible se achica sin teclado.
        const visible = viewport.height * viewport.scale;
        const keyboard = window.innerHeight - visible > KEYBOARD_MIN_PX;
        root.dataset.keyboard = keyboard ? 'open' : 'closed';
        if (!ios) return;
        root.style.setProperty('--app-height', `${Math.round(visible)}px`);
        if (keyboard) window.scrollTo(0, 0);
    };

    viewport.addEventListener('resize', update);
    update();
};
