 import { useEffect, useState, type ReactNode } from "react";
import { useLogin } from "../hooks/useLogin";
import { AuthContext } from "./auth.context";
import type { User } from "../models/user.mode";
import type { AxiosError } from "axios";
import { useVerifyLogin } from "../hooks/useVerifyLogin";
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
        setUser(null);
        setErrors([]);
        logOutMutation.mutate();
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
        }}>
            {children}
        </AuthContext.Provider>
    )
}