import { Forward } from "lucide-react";

/**
 * «Reenviado» en la burbuja, sobre la cita (diseño, decisión «Reenviado»): gris;
 * «muchas veces» (una cadena) en negrita y con doble flecha, que pesa más sin
 * ser una alerta.
 */
export const ForwardedLabel = ({ forwarded, onDeep }: { forwarded: "once" | "many"; onDeep: boolean }) => {
    const many = forwarded === "many";
    return (
        <div className={`flex items-center gap-[5px] pb-[3px] text-xs ${many ? "font-bold" : "font-medium"}
            ${onDeep ? "text-brand-on-deep-muted" : "text-brand-muted"}`}>
            <span className="flex">
                <Forward size={13} strokeWidth={2.2} />
                {many && <Forward size={13} strokeWidth={2.2} className="-ml-[7px]" />}
            </span>
            {many ? "Reenviado muchas veces" : "Reenviado"}
        </div>
    );
};
