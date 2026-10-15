import { SkeletonFrame } from "../../../components/Skeleton/SkeletonFrame";
import { SkeletonListRow } from "../../../components/Skeleton/SkeletonListRow";

/** El cuadrito de color de una línea (`LineSwatch`), para las listas de líneas. */
export const LINE_SWATCH_SKELETON = 'w-2.5 h-2.5 rounded-[3px] self-center';

interface Props {
    /** Para el lector de pantalla: «Cargando las líneas». */
    label: string;
    visible: boolean;
    rows: number;
    /** Lo que encabeza cada fila real: el cuadrito de la línea, el avatar de la persona… */
    avatar?: string;
    /** La píldora debajo del texto (móvil, «Tus líneas») en vez de a la derecha. */
    pillBelow?: boolean;
    /** El padding de la fila real. */
    rowClassName: string;
    /** Con su borde y separadores, como las listas de Ajustes; sin él, va dentro de uno que ya existe. */
    bordered?: boolean;
}

/**
 * La lista de una tarjeta de Ajustes mientras carga (diseño 3.5): la tarjeta
 * mantiene su título, su explicación y su botón; solo la lista es skeleton.
 */
export const SettingsListSkeleton = ({ label, visible, rows, avatar, pillBelow = false, rowClassName, bordered = true }: Props) => (
    <SkeletonFrame label={label} visible={visible}
        className={bordered ? 'rounded-[10px] border border-brand-border overflow-hidden divide-y divide-brand-raised' : 'divide-y divide-brand-border'}>
        {Array.from({ length: rows }, (_, i) => (
            <SkeletonListRow key={i} index={i} avatar={avatar} className={`bg-brand-surface ${rowClassName}`}
                {...(pillBelow ? { pills: 1 } : { trailing: 'pill' as const })} />
        ))}
    </SkeletonFrame>
);
