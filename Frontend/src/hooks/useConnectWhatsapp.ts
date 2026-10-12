import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { loadFacebookSdk } from "../libs/facebookSdk";
import { connectWhatsappService } from "../services/api.service";
import { LINES_QUERY_KEY } from "./useLines";

const CONFIG_ID = import.meta.env.VITE_META_CONFIG_ID;

export const useConnectWhatsapp = () => {
    const queryClient = useQueryClient();
    // Mientras la ventana de Facebook está abierta: conectar ya empezó, aunque
    // todavía no se haya llamado al backend.
    const [isSigningIn, setIsSigningIn] = useState(false);
    const mutation = useMutation({
        mutationFn: ({ code, phoneNumberId, waBusinessId }: { code: string; phoneNumberId: string; waBusinessId: string }) =>
            connectWhatsappService(code, phoneNumberId, waBusinessId),
        onSettled: () => queryClient.invalidateQueries({ queryKey: LINES_QUERY_KEY }),
    });

    const connect = async () => {
        mutation.reset();
        setIsSigningIn(true);
        // 1. Nos aseguramos de que el SDK esté cargado e inicializado.
        try {
            await loadFacebookSdk();
        } catch (error) {
            setIsSigningIn(false);
            throw error;
        }

        // Aquí guardaremos los IDs que llegan por postMessage.
        const sessionInfo: { phoneNumberId?: string; waBusinessId?: string } = {};

        // 2. Escuchamos el mensaje del popup con phone_number_id y waba_id.
        const messageListener = (event: MessageEvent) => {
            if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
            try {
                const data = JSON.parse(event.data);
                if (data.type === "WA_EMBEDDED_SIGNUP" && data.event === "FINISH") {
                    sessionInfo.phoneNumberId = data.data.phone_number_id;
                    sessionInfo.waBusinessId = data.data.waba_id;
                }
            } catch {
                // No era un mensaje nuestro (JSON inválido) → lo ignoramos.
            }
        };
        window.addEventListener("message", messageListener);

        // 3. Abrimos el popup de Facebook con tu configuración de Embedded Signup.
        window.FB.login(
            (response) => {
                window.removeEventListener("message", messageListener);
                setIsSigningIn(false);
                const code = response?.authResponse?.code;

                // 4. Si tenemos el code Y los IDs → mandamos todo al backend.
                if (code && sessionInfo.phoneNumberId && sessionInfo.waBusinessId) {
                    mutation.mutate({
                        code,
                        phoneNumberId: sessionInfo.phoneNumberId,
                        waBusinessId: sessionInfo.waBusinessId,
                    });
                }
            },
            {
                config_id: CONFIG_ID,
                response_type: "code",
                override_default_response_type: true,
                extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
            }
        );
    };

    return { ...mutation, connect, isConnecting: isSigningIn || mutation.isPending };
};
