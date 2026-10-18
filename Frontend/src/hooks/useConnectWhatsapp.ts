import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { loadFacebookSdk } from "../libs/facebookSdk";
import { connectWhatsappService } from "../services/api.service";
import { LINES_QUERY_KEY } from "./useLines";
import { embeddedSignupFinish, type EmbeddedSignupFinish } from "../utils/embeddedSignup";

const CONFIG_ID = import.meta.env.VITE_META_CONFIG_ID;

export const useConnectWhatsapp = () => {
    const queryClient = useQueryClient();
    // Mientras la ventana de Facebook está abierta: conectar ya empezó, aunque
    // todavía no se haya llamado al backend.
    const [isSigningIn, setIsSigningIn] = useState(false);
    // El camino de la conexión en curso (o de la última): con la app de WhatsApp
    // Business, el texto del «Conectando…» habla del código que se escanea.
    const [businessApp, setBusinessApp] = useState(false);
    const mutation = useMutation({
        mutationFn: ({ code, finish }: { code: string; finish: EmbeddedSignupFinish }) =>
            connectWhatsappService({ code, ...finish }),
        onSettled: () => queryClient.invalidateQueries({ queryKey: LINES_QUERY_KEY }),
    });

    /** `businessApp`: el número sigue en la app de WhatsApp Business (coexistencia). */
    const connect = async ({ businessApp: viaBusinessApp = false }: { businessApp?: boolean } = {}) => {
        mutation.reset();
        setBusinessApp(viaBusinessApp);
        setIsSigningIn(true);
        // 1. Nos aseguramos de que el SDK esté cargado e inicializado.
        try {
            await loadFacebookSdk();
        } catch (error) {
            setIsSigningIn(false);
            throw error;
        }

        // Aquí guardaremos lo que llega por postMessage al terminar.
        let finish: EmbeddedSignupFinish | null = null;

        // 2. Escuchamos el mensaje del popup: `FINISH` (WABA y número) o, con la
        //    app de WhatsApp Business, `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`
        //    (solo el WABA).
        const messageListener = (event: MessageEvent) => {
            if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
            try {
                finish = embeddedSignupFinish(JSON.parse(event.data)) ?? finish;
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

                // 4. Si tenemos el code Y el final del popup → mandamos todo al backend.
                //    Un número de la app también puede terminar con `FINISH` (el
                //    flujo que empieza por el número), así que vale también lo
                //    que respondió la persona: el backend no lo registra si Meta
                //    no llega a decir si está en la app.
                if (code && finish) mutation.mutate({ code, finish: { ...finish, businessApp: finish.businessApp || viaBusinessApp } });
            },
            {
                config_id: CONFIG_ID,
                response_type: "code",
                override_default_response_type: true,
                // Solo cambia `featureType`: así se abre el camino de la app de
                // WhatsApp Business (coexistencia, guía de Meta).
                extras: { setup: {}, featureType: viaBusinessApp ? "whatsapp_business_app_onboarding" : "", sessionInfoVersion: "3" },
            }
        );
    };

    return { ...mutation, connect, businessApp, isConnecting: isSigningIn || mutation.isPending };
};
