// Lo que usa la app del SDK de Facebook (`libs/facebookSdk.ts` y `useConnectWhatsapp`)
export interface FacebookLoginResponse {
    status?: string;
    // Con `response_type: "code"` trae el code para canjearlo en el backend
    authResponse?: { code?: string } | null;
}

export interface FacebookLoginOptions {
    config_id: string;
    response_type?: "code";
    override_default_response_type?: boolean;
    extras?: Record<string, unknown>;
}

interface FacebookSdk {
    init: (params: { appId: string; autoLogAppEvents?: boolean; xfbml?: boolean; version: string }) => void;
    login: (callback: (response: FacebookLoginResponse) => void, options: FacebookLoginOptions) => void;
}

declare global {
    interface Window {
        FB: FacebookSdk;
        fbAsyncInit: () => void;
    }
}
