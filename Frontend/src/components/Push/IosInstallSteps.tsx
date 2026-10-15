import { Share, SquarePlus } from "lucide-react";
import { isIosSafari } from "../../libs/push";
import { NumberedSteps, type NumberedStep } from "./NumberedSteps";

const inlineIcon = "inline-block align-[-3px] mx-0.5 text-brand-info";

/** Los pasos de iPhone para añadir Wasmish a la pantalla de inicio (diseño A8). */
const iosInstallSteps = (): NumberedStep[] => [
    // Desde Chrome o Firefox en el iPhone no se puede: primero, a Safari.
    ...(isIosSafari() ? [] : [{
        content: <>Abre <strong className="text-brand-text">Safari</strong> y entra en <strong className="text-brand-text">{window.location.host}</strong>. Desde este navegador no se puede añadir al inicio.</>,
    }]),
    {
        content: <>Toca <strong className="text-brand-text">Compartir</strong> <Share size={16} className={inlineIcon} /> en la barra de Safari. Si no lo ves, toca <strong className="text-brand-text">···</strong> primero.</>,
    },
    {
        content: <>Elige <strong className="text-brand-text">Añadir a pantalla de inicio</strong> <SquarePlus size={16} className={inlineIcon} /> y luego <strong className="text-brand-text">Añadir</strong>.</>,
    },
    { content: <>Cierra Safari y abre Wasmish desde su <strong className="text-brand-text">ícono</strong>.</> },
    { content: <><strong className="text-brand-text">Inicia sesión otra vez.</strong> La app no comparte la sesión con Safari.</> },
    { content: <>Toca <strong className="text-brand-text">Activar avisos</strong>. Te lo pediremos al entrar.</>, later: true },
];

export const IosInstallSteps = () => {
    const steps = iosInstallSteps();
    return (
        <>
            <p className="text-[15px] leading-[1.5] text-brand-strong">
                En iPhone los avisos solo llegan a Wasmish abierta desde su ícono. Son {steps.length} pasos:
            </p>
            <div className="mt-2">
                <NumberedSteps steps={steps} divided />
            </div>
            <p className="mt-3 pt-3 border-t border-brand-border text-[13px] leading-[1.5] text-brand-muted">
                Solo en este iPhone · muestran nombre y texto con el teléfono bloqueado · al cerrar sesión dejan de llegar.
            </p>
        </>
    );
};
