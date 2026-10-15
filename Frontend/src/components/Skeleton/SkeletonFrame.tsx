import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSyncedPulse } from "./skeletonShared";

/**
 * Lo que oye el lector de pantalla: «Cargando contactos». El texto entra un
 * fotograma después de montarse: un `role="status"` que ya existía anuncia el
 * texto al aparecer, uno recién montado con el texto puesto no siempre.
 */
export const SkeletonStatus = ({ label }: { label: string }) => {
    const [text, setText] = useState('');
    useEffect(() => {
        const frame = requestAnimationFrame(() => setText(label));
        return () => cancelAnimationFrame(frame);
    }, [label]);
    return <span role="status" className="sr-only">{text}</span>;
};

interface Props {
    /** Qué se carga, para el lector de pantalla: «Cargando contactos». */
    label: string;
    className?: string;
    children: ReactNode;
}

/**
 * Una zona que carga: la anuncia y sincroniza su pulso. No anima ni oculta
 * nada ella misma: cada bloque late y se oculta al lector por su cuenta, así
 * el texto real de dentro se sigue leyendo y anidar zonas no multiplica la
 * opacidad.
 */
export const SkeletonFrame = ({ label, className = '', children }: Props) => {
    const ref = useRef<HTMLDivElement>(null);
    useSyncedPulse(ref);

    return (
        <div ref={ref} aria-busy="true" className={className}>
            <SkeletonStatus label={label} />
            {children}
        </div>
    );
};
