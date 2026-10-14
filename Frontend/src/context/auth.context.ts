import { createContext, useContext } from "react";
import type { User } from "../models/user.mode";

interface AuthContextProps {
    user: User | null;
    signIn: (email: string, password: string) => void;
    signUp: (name: string, email: string, password: string) => void;
    logOut: () => void;
    isAuthenticated: boolean;
    errors: string[];
    isLoading: boolean;
    /** Si la sesión tiene esa acción (`permissions` del backend; la autoridad sigue siendo él). */
    can: (action: string) => boolean;
    /** Entra con la sesión que ya abrió el backend (aceptar una invitación). */
    enterSession: (user: User) => void;
    /** Le cambiaron el acceso: se olvida lo que había y se vuelve a leer la sesión. */
    onAccessChanged: () => void;
}


export const AuthContext = createContext<AuthContextProps | null>(
    /* {
        user: null,
        signIn: () => { },
        logOut: () => { },
        isAuthenticated: false,
        errors: [],
        isLoading: false
    } */
    null
);

export const useAuthContext = () => {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error("AuthContext must be used with an AuthProvider")
    }

    return context;
}