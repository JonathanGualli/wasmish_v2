 import { useCallback, useEffect, useState, type ReactNode } from "react";
import axios from "axios";
import { useQueryClient } from "@tanstack/react-query";
import { useLogin } from "../hooks/useLogin";
import { AuthContext } from "./auth.context";
import { clearAllDrafts } from "../utils/conversationDraft";
import { clearAllCampaignDrafts } from "../utils/campaignDraft";
import type { User } from "../models/user.mode";
import type { AxiosError } from "axios";
import { useVerifyLogin, VERIFY_QUERY_KEY } from "../hooks/useVerifyLogin";
import { verifyService } from "../services/api.service";
import { useSignUp } from "../hooks/useSignUp";
import { useLogOut } from "../hooks/useLogOut";

interface AuthProps{
    children: ReactNode;
}
interface ErrorItem {
  message: string;
}

export const AuthProvider = ({ children }: AuthProps) => {

    const { data: verifyData, isLoading: isVerifying, isError: verifyError } = useVerifyLogin();
    // Funciona de esta foram, pero ..... no se porque ..... no entiendo la logica de este useeffect authcheked
    const [authChecked, setAuthChecked] = useState(false);
    const [user, setUser] = useState<User | null>(null);
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

    // La sesión dejó de valer (desactivada, o la cookie caducó): fuera, sin
    // llamar a /logout, que ya no tiene sesión que cerrar.
    const expireSession = useCallback(() => {
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
        console.log("AuthProvider: Verifying login status");
        if (verifyData) setUser(verifyData); 
        if (verifyError) setUser(null);/*  */
    }, [verifyData, verifyError]); 

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
                    setUser(data); 
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
                    setUser(data); 
                    setErrors([]);
                },
                onError: (error: Error) => { 
                    const message = (error as AxiosError<ErrorItem[]>)?.response?.data?.map(err => err.message) || ['An error occurred during SignUp'];
                    setErrors(message);
                },
            }
        );

    };
 
    const logOut = () => {
        // Los borradores (conversación nueva, campaña) son de esta sesión:
        // no debe verlos quien entre después en el mismo navegador.
        clearAllDrafts();
        clearAllCampaignDrafts();
        clearSessionCache();
        setUser(null);
        setErrors([]);
        logOutMutation.mutate();
    };

    const can = (action: string) => Boolean(user?.permissions?.includes(action));

    const enterSession = (session: User) => {
        clearSessionCache();
        queryClient.setQueryData(VERIFY_QUERY_KEY, session);
        setUser(session);
        setErrors([]);
    };

    // `access_changed` por el SSE (le cambiaron el rol, las líneas o el estado):
    // lo que había en pantalla se vuelve a pedir desde cero con el acceso nuevo
    // (revisión de Codex del plan: invalidar no bastaba, los datos viejos se
    // quedaban), y la sesión se vuelve a leer. Con 401, fuera.
    const onAccessChanged = async () => {
        await queryClient.resetQueries({ predicate: (query) => query.queryKey[0] !== VERIFY_QUERY_KEY[0] });
        try {
            const session = await queryClient.fetchQuery({ queryKey: VERIFY_QUERY_KEY, queryFn: verifyService, staleTime: 0 });
            setUser(session);
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
            can,
            enterSession,
            onAccessChanged,
        }}>
            {children}
        </AuthContext.Provider>
    )
}