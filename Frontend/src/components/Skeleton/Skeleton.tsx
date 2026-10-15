import { useContext } from "react";
import { SkeletonVisibleContext } from "./skeletonShared";

/*
 * Los bloques de las pantallas de carga (diseño «Wasmish Pantallas de carga»).
 * Cada uno late por su cuenta (sin brillo que recorra, quieto con «reducir
 * movimiento») y se oculta al lector de pantalla: lo que se carga lo dice
 * `SkeletonStatus`.
 */

const TONE = {
    raised: 'bg-brand-raised',
    soft: 'bg-brand-skeleton-soft',
    bubble: 'bg-brand-skeleton-bubble',
    'bubble-own': 'bg-brand-skeleton-bubble-own',
    /** Sobre la barra oscura: los accesos, su avatar y, dentro del bloque de identidad, sus líneas. */
    deep: 'bg-brand-deep-active',
    'deep-hover': 'bg-brand-deep-hover',
    'deep-dim': 'bg-brand-deep',
};

interface BoxProps {
    /** El tamaño y el radio: los mismos que lo que va a llegar. */
    className: string;
    tone?: keyof typeof TONE;
    width?: string;
    /** Para un bloque suelto, fuera de una zona: si ya se enseña. Dentro de una, lo dice la zona. */
    visible?: boolean;
}

/** Un bloque cualquiera: avatar, burbuja, caja. Los demás son atajos de este. */
export const SkeletonBox = ({ className, tone = 'raised', width, visible }: BoxProps) => {
    const zoneVisible = useContext(SkeletonVisibleContext);
    const shown = visible ?? zoneVisible;
    return (
        <span
            aria-hidden
            style={width ? { width } : undefined}
            className={`block flex-none motion-safe:animate-skeleton-pulse ${TONE[tone]} ${className}
                ${shown ? '' : 'invisible'}`}
        />
    );
};

/** Texto principal (10 px en una caja de 20) o, con `soft`, secundario (8 px, un tono más claro). */
export const SkeletonLine = ({ width, soft = false, className = '', visible }: { width: string; soft?: boolean; className?: string; visible?: boolean }) => (
    <SkeletonBox
        width={width}
        visible={visible}
        tone={soft ? 'soft' : 'raised'}
        className={`${soft ? 'h-2 rounded-[4px]' : 'h-2.5 rounded-[5px]'} ${className}`}
    />
);

/** Una píldora de estado. */
export const SkeletonPill = ({ width }: { width: string }) => (
    <SkeletonBox width={width} tone="soft" className="h-5 rounded-[10px]" />
);

/** Una cifra. `className` cambia el alto cuando la cifra es grande. */
export const SkeletonNumber = ({ width, className = 'h-3', visible }: { width: string; className?: string; visible?: boolean }) => (
    <SkeletonBox width={width} visible={visible} className={`rounded-[4px] ${className}`} />
);

/** Un campo de formulario: su etiqueta real y la caja del alto del campo (`boxClassName`: el alto y el radio del real). */
export const SkeletonField = ({ label, boxClassName = 'h-[42px] rounded-[8px]' }: { label: string; boxClassName?: string }) => (
    <div className="grid gap-[7px]">
        <span className="text-[13px] font-semibold text-brand-strong">{label}</span>
        <SkeletonBox className={`w-full ${boxClassName}`} />
    </div>
);
