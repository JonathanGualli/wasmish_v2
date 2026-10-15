import { SkeletonBox, SkeletonLine, SkeletonPill } from "./Skeleton";
import { skeletonWidth } from "./skeletonShared";

/** Los avatares de las listas: el tamaño y el radio de los reales. */
export const AVATAR_SM = 'w-[34px] h-[34px] rounded-[9px]';
export const AVATAR_LG = 'w-10 h-10 rounded-[10px]';

const PILL_WIDTHS = ['84px', '64px'];

export interface SkeletonListRowProps {
    /** La posición en la lista: varía el ancho de las líneas. */
    index: number;
    /** Las clases de tamaño y radio del avatar; sin él, la fila no lleva. */
    avatar?: string;
    /** Lo que va a la derecha: la hora o una píldora de estado. */
    trailing?: 'time' | 'pill';
    /** Píldoras bajo las dos líneas (estado, etiquetas). */
    pills?: number;
    /** El hueco de la etiqueta de línea (bandeja con varias líneas). */
    lineTag?: boolean;
    /** El padding y el borde de la fila real a la que sustituye. */
    className?: string;
}

/**
 * La fila de lista de las pantallas de carga: la de las tablas en el móvil, la
 * bandeja, Ajustes y la entrada a la app. Avatar, dos líneas y lo que lleve
 * cada lista.
 */
export const SkeletonListRow = ({ index, avatar, trailing, pills = 0, lineTag = false, className = 'px-4 py-3.5' }: SkeletonListRowProps) => (
    <div className={`flex gap-3 ${className}`}>
        {avatar && <SkeletonBox className={avatar} />}
        <div className="flex-1 min-w-0 grid gap-2 content-center">
            <div className="flex items-center gap-3">
                <SkeletonLine width={skeletonWidth(index)} />
                {trailing === 'time' && <SkeletonLine soft width="30px" className="ml-auto" />}
            </div>
            <SkeletonLine soft width={skeletonWidth(index, 3, 10)} />
            {lineTag && <SkeletonBox tone="soft" className="h-[7px] w-[70px] rounded-[4px]" />}
            {pills > 0 && (
                <div className="flex gap-1.5 mt-1">
                    {PILL_WIDTHS.slice(0, pills).map(width => <SkeletonPill key={width} width={width} />)}
                </div>
            )}
        </div>
        {trailing === 'pill' && <div className="self-center"><SkeletonPill width="72px" /></div>}
    </div>
);
