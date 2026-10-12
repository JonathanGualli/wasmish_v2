/**
 * El cuadrito de una línea de WhatsApp: su color, asignado por orden de
 * conexión (`useLines().colorOf`). Una línea desconectada lleva el cuadro vacío.
 * Es la misma pieza en Ajustes, la bandeja, el chat, la ficha y las campañas.
 */
export const LineSwatch = ({ colorClass, disconnected = false, size = 'md' }: {
    colorClass: string;
    disconnected?: boolean;
    size?: 'sm' | 'md';
}) => (
    <span
        aria-hidden
        className={`flex-none box-border
            ${size === 'sm' ? 'w-2 h-2 rounded-[2px]' : 'w-2.5 h-2.5 rounded-[3px]'}
            ${disconnected ? 'border-[1.5px] border-brand-subtle' : colorClass}`}
    />
);
