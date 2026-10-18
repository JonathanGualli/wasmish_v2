// Cómo termina la ventana de Facebook (Embedded Signup). Con un número nuevo,
// Meta manda `FINISH` con el WABA y el número; con uno que sigue en la app de
// WhatsApp Business (coexistencia), `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`
// solo con el WABA: el backend deduce el número. En la prueba real (2026-10-16),
// un número de la app terminó con `FINISH` y su número: `businessApp` dice solo
// lo que trajo el evento, y `useConnectWhatsapp` le suma lo que respondió la persona.

export interface EmbeddedSignupFinish {
    waBusinessId: string;
    phoneNumberId: string | null;
    businessApp: boolean;
}

/** Los datos del `postMessage` de la ventana de Facebook, o `null` si no es un final válido. */
export const embeddedSignupFinish = (data: unknown): EmbeddedSignupFinish | null => {
    if (typeof data !== 'object' || data === null) return null;
    const { type, event, data: payload } = data as { type?: unknown; event?: unknown; data?: { waba_id?: unknown; phone_number_id?: unknown } };
    if (type !== 'WA_EMBEDDED_SIGNUP') return null;
    const waBusinessId = typeof payload?.waba_id === 'string' && payload.waba_id ? payload.waba_id : null;
    if (!waBusinessId) return null;

    if (event === 'FINISH') {
        const phoneNumberId = typeof payload?.phone_number_id === 'string' && payload.phone_number_id ? payload.phone_number_id : null;
        return phoneNumberId ? { waBusinessId, phoneNumberId, businessApp: false } : null;
    }
    if (event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING') return { waBusinessId, phoneNumberId: null, businessApp: true };
    return null;
};
