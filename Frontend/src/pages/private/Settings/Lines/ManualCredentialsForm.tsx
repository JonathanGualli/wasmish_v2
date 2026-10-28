import { useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { CustomButton } from "../../../../components/Button/Button";
import { CustomInput } from "../../../../components/Input/Input";
import { Callout } from "../../../../components/Callout/Callout";
import { useNotice } from "../../../../components/Notice/context/useNotice";
import { useUpdateWhatsappToken } from "../../../../hooks/useUpdateWhatsappToken";
import { LINE_ERROR } from "../../../../models/line.model";
import { apiErrorOf } from "../../../../utils/apiError";
import { isBusy } from "./lineActionError";

/**
 * La carga manual de credenciales (para números de prueba): conecta, renueva o
 * reemplaza con las mismas reglas que el botón. Plegada para no competir con el
 * Embedded Signup. Los errores van dentro, y marcan el campo que lo causó.
 */
export const ManualCredentialsForm = ({ hasToken }: { hasToken: boolean }) => {
    const [token, setToken] = useState('');
    const [phoneNumberId, setPhoneNumberId] = useState('');
    const [waBusinessId, setWaBusinessId] = useState('');
    const mutation = useUpdateWhatsappToken();
    const { notify } = useNotice();

    const error = mutation.isError ? apiErrorOf(mutation.error) : null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        mutation.mutate({ tokenWhatsapp: token, phoneNumberId, waBusinessId }, {
            onSuccess: () => {
                setToken('');
                notify({ kind: 'success', text: 'Número conectado correctamente.' });
            },
        });
    };

    return (
        <details className="group border-t border-brand-raised pt-[18px]">
            <summary className="flex items-center gap-1.5 min-h-11 sm:min-h-0 cursor-pointer list-none text-sm font-semibold
                text-brand-gray-600 hover:text-brand-text transition-colors">
                <ChevronRight size={16} className="flex-none transition-transform group-open:rotate-90" />
                <span className="flex-none whitespace-nowrap">Cargar credenciales a mano</span>
                <span className="max-sm:hidden ml-1.5 min-w-0 font-normal text-brand-muted">
                    Para números de prueba. Conecta, renueva o reemplaza con las mismas reglas que el botón.
                </span>
            </summary>

            <form onSubmit={handleSubmit} className="grid gap-[18px] mt-5">
                <CustomInput
                    label="Token de acceso a WhatsApp"
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={hasToken ? "Escribe un token nuevo para renovarlo o conectar otro número" : "EAA..."}
                />
                <div className="grid gap-[18px] sm:grid-cols-2">
                    <CustomInput
                        label="ID de teléfono de WhatsApp"
                        value={phoneNumberId}
                        onChange={(e) => setPhoneNumberId(e.target.value)}
                        invalid={error?.code === LINE_ERROR.phoneNumberNotInWaba || error?.code === LINE_ERROR.phoneNumberTaken}
                    />
                    <CustomInput
                        label="ID de WhatsApp Business"
                        value={waBusinessId}
                        onChange={(e) => setWaBusinessId(e.target.value)}
                        invalid={error?.code === LINE_ERROR.wabaTaken}
                    />
                </div>
                {error && (
                    <Callout tone={isBusy(error) ? 'warning' : 'danger'} icon={<AlertTriangle size={16} />}>
                        {error.message}
                    </Callout>
                )}
                <div className="w-full sm:w-40 h-10 sm:justify-self-end">
                    <CustomButton variant="secondary" type="submit" isLoading={mutation.isPending}>
                        Guardar
                    </CustomButton>
                </div>
            </form>
        </details>
    );
};
