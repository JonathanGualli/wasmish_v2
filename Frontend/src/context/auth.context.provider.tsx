 import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import axios from "axios";
import { useQueryClient } from "@tanstack/react-query";
import { useLogin } from "../hooks/useLogin";
import { AuthContext } from "./auth.context";
import { clearAllDrafts } from "../utils/conversationDraft";
import { clearAllCampaignDrafts } from "../utils/campaignDraft";
import type { User } from "../models/user.mode";
import type { AxiosError } from "axios";
import { useVerifyLogin, VERIFY_QUERY_KEY } from "../hooks/useVerifyLogin";
import { getPushConfigService, verifyService } from "../services/api.service";
import { PUSH_CONFIG_QUERY_KEY } from "../hooks/usePushNotifications";
import { disablePush, syncPushSubscription } from "../libs/push";
import { useSignUp } from "../hooks/useSignUp";
import { useLogOut } from "../hooks/useLogOut";
import { forgetRememberedUser, rememberUser } from "../utils/rememberedUser";

// Cuánto espera cerrar sesión a que se apaguen los avisos. El navegador ya
// canceló la suscripción antes del DELETE; más espera solo retrasaría /logout.
const DISABLE_PUSH_TIMEOUT_MS = 3000;

interface AuthProps{
    children: ReactNode;
}
interface ErrorItem {
  message: string;
}

export const AuthProvider = ({ children }: AuthProps) => {

    const { data: verifyData, isLoading: isVerifying, error: verifyError, isPlaceholderData: isRemembered } = useVerifyLogin();
    // Funciona de esta foram, pero ..... no se porque ..... no entiendo la logica de este useeffect authcheked
    // Con el usuario recordado, desde el primer render: sin un fotograma de
    // carga ni de login antes de la app.
    const [authChecked, setAuthChecked] = useState(!isVerifying);
    const [user, setUser] = useState<User | null>(() => verifyData ?? null);
    // El usuario es el recordado y /verify aún no lo confirmó (o no hay red).
    const [provisional, setProvisional] = useState(isRemembered);
    const provisionalId = useRef(isRemembered ? verifyData?.id : undefined);
    const [errors, setErrors] = useState<string[]>([]);
    const loginMutation = useLogin();
    const signUpMutation = useSignUp();
    const logOutMutation = useLogOut();
    const queryClient = useQueryClient();

    // Lo que se pidió con una sesión (conversaciones, contactos, líneas…) no
    // puede verlo la siguiente en el mismo navegador, ni un momento mientras
    // llegan sus datos: la caché se vacía al salir y al entrar. Menos la
    // verificación de la sesión, que es la que dice quién está dentro.
    const clearSessionCache = useCallback(() =>
        queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== VERIFY_QUERY_KEY[0] }), [queryClient]);
    // Lo mismo con la pantalla montada: vuelve a pedir lo que se ve.
    const resetSessionQueries = useCallback(() =>
        queryClient.resetQueries({ predicate: (query) => query.queryKey[0] !== VERIFY_QUERY_KEY[0] }), [queryClient]);

    /** Una sesión que acaba de dar el backend. */
    const confirmUser = useCallback((session: User) => {
        setUser(session);
        setProvisional(false);
    }, []);

    // La sesión dejó de valer (desactivada, o la cookie caducó): fuera, sin
    // llamar a /logout, que ya no tiene sesión que cerrar.
    const expireSession = useCallback(() => {
        forgetRememberedUser();
        clearSessionCache();
        queryClient.removeQueries({ queryKey: VERIFY_QUERY_KEY });
        setUser(null);
    }, [clearSessionCache, queryClient]);

    // Cualquier 401 de la API con la sesión abierta la cierra (Fase 3: a quien
    // desactivan, la siguiente petición le responde 401). El login y /verify
    // tienen su propio manejo.
    useEffect(() => {
        const interceptor = axios.interceptors.response.use(undefined, (error) => {
            const url = String(error?.config?.url ?? '');
            if (error?.response?.status === 401 && !url.endsWith('/verify') && !url.endsWith('/login')) expireSession();
            return Promise.reject(error);
        });
        return () => axios.interceptors.response.eject(interceptor);
    }, [expireSession]);

    useEffect(() => {
        if (!isVerifying ) {
            setAuthChecked(true); 
        }
    }, [isVerifying]);

    // Cuando cambie la verificación de sesión, actualizamos user
    useEffect(() => {
        if (verifyData && isRemembered) {
            provisionalId.current = verifyData.id;
            setUser(verifyData);
            setProvisional(true);
        } else if (verifyData) {
            // Entró otra persona (en otra pestaña): lo pedido mientras se veía
            // la recordada no es de esta sesión.
            if (provisionalId.current && provisionalId.current !== verifyData.id) resetSessionQueries();
            provisionalId.current = undefined;
            confirmUser(verifyData);
        } else if (verifyError) {
            // Sin red, la recordada se queda (sin confirmar) y /verify se
            // repite al volver la conexión: no es una sesión caducada.
            const unauthorized = (verifyError as AxiosError).response?.status === 401;
            if (provisionalId.current && !unauthorized) return;
            provisionalId.current = undefined;
            forgetRememberedUser();
            setUser(null);
        }
    }, [verifyData, isRemembered, verifyError, confirmUser, resetSessionQueries]);

    // Para la próxima vez que se abra la app, la sesión ya confirmada.
    useEffect(() => {
        if (user && !provisional) rememberUser(user);
    }, [user, provisional]);

    // Con la sesión dentro: si la persona tenía los avisos activos en este
    // navegador y la suscripción se perdió (Safari la tira sin avisar), se
    // recrea. Sin esperar: nunca frena la entrada ni rechaza. Con la sesión
    // confirmada: recrearla con la recordada podría ser con la de otro.
    const sessionId = provisional ? undefined : user?.id;
    useEffect(() => {
        if (!sessionId) return;
        queryClient.fetchQuery({ queryKey: PUSH_CONFIG_QUERY_KEY, queryFn: getPushConfigService, staleTime: Infinity })
            .then(({ publicKey }) => syncPushSubscription(publicKey))
            .catch(() => {});
    }, [sessionId, queryClient]);

    useEffect(() => {
        if(errors.length > 0) {
            const timer = setTimeout(()=>{
                setErrors([]);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [errors]);

    const signIn = async (email: string, password: string) => {
        setUser(null);
        setErrors([]);
        // Log the email and password for debugging purposes
        // console.log("signIn called with:", email, password);
        loginMutation.mutate(
            { email, password },
            {
                onSuccess: (data: User) => { 
                    clearSessionCache();
                    confirmUser(data);
                    setErrors([]);
                },
                onError: (error: Error) => { 
                    const message = (error as AxiosError<ErrorItem[]>)?.response?.data?.map(err => err.message) || ['An error occurred during login'];
                    setErrors(message);
                },
            }
            
        );
    };

    const signUp = async (name: string, email: string, password: string) => {
        setUser(null);
        setErrors([]);
        
        signUpMutation.mutate(
            { name, email, password },
            {
                onSuccess: (data: User) => { 
                    clearSessionCache();
                    confirmUser(data);
                    setErrors([]);
                },
                onError: (error: Error) => { 
                    const message = (error as AxiosError<ErrorItem[]>)?.response?.data?.map(err => err.message) || ['An error occurred during SignUp'];
                    setErrors(message);
                },
            }
        );

    };
 
    const logOut = async () => {
        // Los borradores (conversación nueva, campaña) son de esta sesión:
        // no debe verlos quien entre después en el mismo navegador.
        clearAllDrafts();
        clearAllCampaignDrafts();
        forgetRememberedUser();
        clearSessionCache();
        setUser(null);
        setErrors([]);
        // Este dispositivo deja de recibir los avisos de quien sale. Antes de
        // /logout, porque borrarla en el backend necesita la sesión. Con un
        // límite: un DELETE colgado dejaba la sesión abierta en el servidor
        // (revisión de Codex del PR #45).
        await Promise.race([
            disablePush(),
            new Promise(resolve => setTimeout(resolve, DISABLE_PUSH_TIMEOUT_MS)),
        ]);
        logOutMutation.mutate();
    };

    const can = (action: string) => Boolean(user?.permissions?.includes(action));

    const enterSession = (session: User) => {
        clearSessionCache();
        queryClient.setQueryData(VERIFY_QUERY_KEY, session);
        confirmUser(session);
        setErrors([]);
    };

    // `access_changed` por el SSE (le cambiaron el rol, las líneas o el estado):
    // lo que había en pantalla se vuelve a pedir desde cero con el acceso nuevo
    // (revisión de Codex del plan: invalidar no bastaba, los datos viejos se
    // quedaban), y la sesión se vuelve a leer. Con 401, fuera.
    const onAccessChanged = async () => {
        await resetSessionQueries();
        try {
            const session = await queryClient.fetchQuery({ queryKey: VERIFY_QUERY_KEY, queryFn: verifyService, staleTime: 0 });
            confirmUser(session);
        } catch {
            expireSession();
        }
    };

    // Check if the user is authenticated
    const isAuthenticated = !!user;
    const isLoading =  !authChecked || loginMutation.isPending;
    //const isLoading = loginMutation.isPending || isVerifying;


    return (
        <AuthContext.Provider value={{
            user,
            signIn,
            signUp,
            logOut,
            isAuthenticated,
            errors,
            isLoading,
            isConfirmed: Boolean(user) && !provisional,
            can,
            enterSession,
            onAccessChanged,
        }}>
            {children}
        </AuthContext.Provider>
    )
}