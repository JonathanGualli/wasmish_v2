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