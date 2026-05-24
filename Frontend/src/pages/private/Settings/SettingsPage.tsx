import { useEffect, useState } from "react";
import { CustomButton } from "../../../components/Button/Button";
import { CustomInput } from "../../../components/Input/Input";
import { useUpdateWhatsappToken } from "../../../hooks/useUpdateWhatsappToken";
import {  useAuthContext } from "../../../context/auth.context";
import type { AxiosError } from "axios";
import { useModalContext } from "../../../components/Modal/context/UseModalContext";
import { useApiKey } from "../../../hooks/useApiKey";


interface ErrorItem {
  message: string;
}

export const SettingsPage = () => {
    
    const [token, setToken ] = useState('');
    const [phoneNumberId, setPhoneNumberId ] = useState('');
    const [waBusinessId, setWaBusinessId] = useState('');

    const updateTokenWhatsappMutation = useUpdateWhatsappToken(); 
    const { user } = useAuthContext();
    const { setState, setContent } = useModalContext();

    const generateApiKey = useApiKey();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        updateTokenWhatsappMutation.mutate({ tokenWhatsapp: token, phoneNumberId: phoneNumberId, waBusinessId: waBusinessId}, {
            onSuccess: () => {
                setContent(
                    <div className="text-green-500">
                        <p>Token de WhatsApp actualizado correctamente.</p>
                    </div>
                );
                setState(true);
                user!.tokenWhatsapp = token;
                user!.phoneNumberId = phoneNumberId;
                user!.waBusinessId = waBusinessId;
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
        // console.log(user);
        if(user?.tokenWhatsapp) {
            setToken(user.tokenWhatsapp);
        }
        if(user?.phoneNumberId) {
            setPhoneNumberId(user.phoneNumberId);
        }
        if(user?.waBusinessId){
            setWaBusinessId(user.waBusinessId);
        }
    }, [user]);

    return (
        <>
        <div className="m-6 p-6 rounded-xl shadow bg-white">
            <h2 className="text-xl font-semibold mb-4">Configuración de WhatsApp</h2>
            <form onSubmit={handleSubmit} className="flex flex-col items-end gap-4">
                <div className="w-full">
                    <CustomInput 
                        label="Token de acceso a Whatapp"
                        type="text"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                    />
                </div>
                <div className="flex flex-row gap-4 w-full">
                    <CustomInput 
                        label="ID de teléfono de WhatsApp"
                        type="text"
                        value={phoneNumberId}
                        onChange={(e) => setPhoneNumberId(e.target.value)}
                    />
                    <CustomInput 
                        label="ID Watsapp Business"
                        type="text"
                        value={waBusinessId}
                        onChange={(e) => setWaBusinessId(e.target.value)}
                    />
                </div>
                <div className="flex flex-col justify-center h-10 w-40">
                    <CustomButton
                    type="submit"
                    isLoading={updateTokenWhatsappMutation.isPending}
                    >
                        Guardar
                    </CustomButton>
                </div>           
            </form>
        </div>
        <div className="m-6 p-6 rounded-xl shadow bg-white">
            <h2 className="text-xl font-semibold mb-4">Configuración Api Keys</h2>
            <form onSubmit={handleSubmit} className="flex flex-col items-end gap-4">
                <div className="flex flex-col justify-center h-10 w-40">
                    <CustomButton
                    type="button"
                    onClick={generateApiKey.mutate}
                    isLoading={updateTokenWhatsappMutation.isPending}
                    >
                        Generar
                    </CustomButton>
                </div>   
            </form>
        </div>
        </>
    );
}