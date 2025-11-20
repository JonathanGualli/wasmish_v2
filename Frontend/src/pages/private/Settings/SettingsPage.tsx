import { useEffect, useState } from "react";
import { CustomButton } from "../../../components/Button/Button";
import { CustomInput } from "../../../components/Input/Input";
import { useUpdateWhatsappToken } from "../../../hooks/useUpdateWhatsappToken";
import {  useAuthContext } from "../../../context/auth.context";
import type { AxiosError } from "axios";
import { useModalContext } from "../../../components/Modal/context/UseModalContext";


interface ErrorItem {
  message: string;
}

export const SettingsPage = () => {
    
    const [token, setToken ] = useState('');
    const [phoneNumberId, setPhoneNumberId ] = useState('');

    const updateTokenWhatsappMutation = useUpdateWhatsappToken(); 
    const { user } = useAuthContext();
    const { setState, setContent } = useModalContext();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        updateTokenWhatsappMutation.mutate({ tokenWhatsapp: token, phoneNumberId: phoneNumberId }, {
            onSuccess: () => {
                setContent(
                    <div className="text-green-500">
                        <p>Token de WhatsApp actualizado correctamente.</p>
                    </div>
                );
                setState(true);
                user!.tokenWhatsapp = token;
                user!.phoneNumberId = phoneNumberId;
            }, onError: (error: Error) => {
                setContent( 
                    <div className="text-red-500">
                        {(error as AxiosError<ErrorItem[]>).response?.data.map((err, i) => (
                            <p key={i}>{err.message}</p>
                        )) || <p>A ocurrido un error, intentalo de nuevo más tarde</p>}
                    </div>)
                setState(true);
            }
        });
    }

    useEffect(() => {
        console.log(user);
        if(user?.tokenWhatsapp) {
            setToken(user.tokenWhatsapp);
        }
        if(user?.phoneNumberId) {
            setPhoneNumberId(user.phoneNumberId);
        }
    }, [user]);

    return <div className="p-6 rounded-xl shadow bg-white">
        <h2 className="text-xl font-semibold mb-4">Configuración de WhatsApp</h2>
        <form onSubmit={handleSubmit} className="flex flex-row items-end gap-4">
            <CustomInput 
                label="Token de acceso a Whatapp"
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
            />
            <CustomInput 
                label="ID de teléfono de WhatsApp"
                type="text"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
            />
            <div className="flex flex-col justify-end h-10 w-40">
                <CustomButton 
                type="submit"
                color="var(--color-green-500)"
                isLoading={updateTokenWhatsappMutation.isPending}
                >
                    Guardar 
                </CustomButton>
            </div>           
        </form>
    </div>;
}