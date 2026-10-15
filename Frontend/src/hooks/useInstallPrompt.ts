import { useSyncExternalStore } from "react";
import { hasInstallPrompt, promptInstall, subscribeInstallPrompt } from "../libs/installPrompt";
import { isStandalone } from "../libs/push";

/** «Instalar Wasmish»: `canInstall` solo si el navegador lo ofrece y no está ya instalada. */
export const useInstallPrompt = () => {
    const available = useSyncExternalStore(subscribeInstallPrompt, hasInstallPrompt);
    return {
        canInstall: available && !isStandalone(),
        install: () => { void promptInstall(); },
    };
};
