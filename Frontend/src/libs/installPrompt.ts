/**
 * «Instalar Wasmish» (Chrome, Edge y Android; Safari no lo tiene). El navegador
 * lanza `beforeinstallprompt` una vez, al cargar la página: se guarda aquí para
 * usarlo cuando la persona toque «Instalar», desde cualquier pantalla.
 */
interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

export const captureInstallPrompt = () => {
    window.addEventListener('beforeinstallprompt', (event) => {
        // Sin la barra propia del navegador: se ofrece desde Ajustes y Chats.
        event.preventDefault();
        deferred = event as BeforeInstallPromptEvent;
        emit();
    });
    window.addEventListener('appinstalled', () => {
        deferred = null;
        emit();
    });
};

export const subscribeInstallPrompt = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

export const hasInstallPrompt = () => deferred !== null;

/** Abre el diálogo del navegador. El evento solo sirve una vez: después se olvida. */
export const promptInstall = async () => {
    const event = deferred;
    if (!event) return;
    deferred = null;
    emit();
    await event.prompt();
};
