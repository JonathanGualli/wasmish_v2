import { useRef, type ReactNode } from "react";
import { SkeletonVisibleContext, useSyncedPulse } from "./skeletonShared";

/**
 * Lo que oye el lector de pantalla: «Cargando contactos». Montado desde que
 * empieza la carga y vacío hasta que el skeleton se ve: un `role="status"` que
 * ya existía anuncia el texto al aparecer, uno recién montado no siempre.
 */
export const SkeletonStatus = ({ label }: { label: string }) => (
    <span role="status" className="sr-only">{label}</span>
);

interface Props {
    /** Qué se carga, para el lector de pantalla: «Cargando contactos». */
    label: string;
    visible: boolean;
    className?: string;
    children: ReactNode;
}

/**
 * Una zona que carga: la anuncia, esconde sus bloques durante la espera y
 * sincroniza su pulso. No anima ni oculta nada ella misma: cada bloque late y
 * se oculta al lector por su cuenta, así el texto real de dentro se sigue
 * leyendo y anidar zonas no multiplica la opacidad.
 */
export const SkeletonFrame = ({ label, visible, className = '', children }: Props) => {
    const ref = useRef<HTMLDivElement>(null);
    useSyncedPulse(ref, visible);

    return (
        <div ref={ref} aria-busy="true" className={className}>
            <SkeletonStatus label={visible ? label : ''} />
            <SkeletonVisibleContext.Provider value={visible}>{children}</SkeletonVisibleContext.Provider>
        </div>
    );
};
