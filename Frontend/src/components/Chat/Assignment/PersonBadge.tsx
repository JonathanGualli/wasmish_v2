import { initials } from "../../../utils/initials";

/**
 * Las iniciales de una persona de la cuenta, en un cuadrito: menta si es quien
 * mira, gris si es otra. `size` en px (16 en la fila, 20 en la cabecera, 28 en
 * el menú y la solicitud).
 */
export const PersonBadge = ({ name, isMe = false, size = 20 }: { name: string | null; isMe?: boolean; size?: 16 | 20 | 22 | 28 }) => {
    const radius = size >= 28 ? 'rounded-[7px]' : size >= 20 ? 'rounded-[5px]' : 'rounded-[4px]';
    const text = size >= 28 ? 'text-[10px]' : size >= 20 ? 'text-[9px]' : 'text-[8px]';
    return (
        <span style={{ width: size, height: size }}
            className={`flex-none flex items-center justify-center font-bold ${radius} ${text}
                ${isMe ? 'bg-brand-accent text-brand-ink' : 'bg-brand-border text-brand-strong'}`}>
            {initials(name ?? '')}
        </span>
    );
};

/** El cuadrito punteado de «Sin asignar». */
export const UnassignedBadge = ({ size = 16 }: { size?: 14 | 16 | 28 }) => (
    <span style={{ width: size, height: size }}
        className={`flex-none border-[1.5px] border-dashed border-brand-subtle ${size >= 28 ? 'rounded-[7px]' : 'rounded-[4px]'}`} />
);
