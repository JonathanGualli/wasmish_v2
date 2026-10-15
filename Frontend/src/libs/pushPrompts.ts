/**
 * Lo que la app recuerda en este navegador para no insistir con los avisos
 * (diseño «Wasmish Móvil - App instalable y avisos», § 2 y 3). Todo en
 * `localStorage`, leído y escrito en un `try`: sin almacenamiento, se vuelve a
 * ofrecer, que es lo menos malo.
 */
const INVITE_KEY = 'wasmish.pushInviteDismissed';
const SHEET_KEY = 'wasmish.pushSheetShown';
const WELCOME_KEY = 'wasmish.installedWelcomeShown';
const INVITE_SILENCE_MS = 30 * 24 * 60 * 60 * 1000;
// La invitación ya no vuelve nunca: la persona activó los avisos alguna vez.
const FOREVER = 'forever';

const read = (key: string) => {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};

const write = (key: string, value: string) => {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Sin almacenamiento: se olvida.
    }
};

/** La invitación de la bandeja (B1, B2): descartada hace menos de 30 días, o los avisos se activaron alguna vez. */
export const isPushInviteDismissed = () => {
    const value = read(INVITE_KEY);
    if (value === FOREVER) return true;
    const at = Number(value);
    return Boolean(value) && Number.isFinite(at) && Date.now() - at < INVITE_SILENCE_MS;
};

/** La × de la invitación: 30 días sin volver en este dispositivo. */
export const dismissPushInvite = () => {
    if (read(INVITE_KEY) !== FOREVER) write(INVITE_KEY, String(Date.now()));
};

/** Al activar los avisos, la invitación desaparece para siempre. */
export const retirePushInvite = () => write(INVITE_KEY, FOREVER);

/** La hoja «Último paso» (C4) se abre sola una sola vez. */
export const wasPushSheetShown = () => read(SHEET_KEY) === '1';
export const markPushSheetShown = () => write(SHEET_KEY, '1');

/** El aviso verde del login en la app recién instalada (C3), solo la primera vez. */
export const wasInstalledWelcomeShown = () => read(WELCOME_KEY) === '1';
export const markInstalledWelcomeShown = () => write(WELCOME_KEY, '1');
