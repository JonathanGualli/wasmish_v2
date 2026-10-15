import type { ColumnDef, RowData } from "@tanstack/react-table";
import { SkeletonBox, SkeletonLine, SkeletonNumber, SkeletonPill } from "../Skeleton/Skeleton";
import { AVATAR_SM } from "../Skeleton/SkeletonListRow";
import { skeletonWidth } from "../Skeleton/skeletonShared";

/**
 * La forma del dato de una columna mientras carga: avatar y dos líneas,
 * título (dos líneas), una línea, una píldora de estado, una cifra o nada.
 */
export type CellSkeleton = 'avatar' | 'title' | 'line' | 'pill' | 'number' | 'none';

declare module '@tanstack/react-table' {
    // Los nombres de los genéricos tienen que ser los de la librería.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface ColumnMeta<TData extends RowData, TValue> {
        /** Sin ella, la columna carga como una línea. */
        skeleton?: CellSkeleton;
    }
}

/** La celda de la tabla, la misma para las filas reales y las de carga: así miden igual. */
export const CELL_CLASS = 'px-4 py-3.5 text-sm text-brand-text align-top';
/** La casilla de selección, igual. */
export const CHECK_CELL_CLASS = 'w-[1%] pl-4 pr-0 py-3.5 align-top';

const NUMBER_WIDTHS = ['28px', '40px', '52px', '36px'];
const PILL_WIDTHS = ['76px', '92px', '104px', '84px'];

const SkeletonCell = ({ kind, row, column }: { kind: CellSkeleton; row: number; column: number }) => {
    // Cada línea en una caja del alto del texto real (14 px sobre 20, y 11,5 px
    // en mono debajo): así la celda mide lo que la que va a llegar.
    const twoLines = (
        <div className="flex-1 min-w-0">
            <div className="h-5 flex items-center"><SkeletonLine width={skeletonWidth(row, column * 7)} /></div>
            <div className="mt-0.5 h-[17px] flex items-center"><SkeletonLine soft width={skeletonWidth(row, column * 7 + 3)} /></div>
        </div>
    );
    // Como mínimo, el alto del avatar en todas las celdas: la fila mide lo que una real.
    const content = {
        avatar: <div className="flex flex-1 items-center gap-3"><SkeletonBox className={AVATAR_SM} />{twoLines}</div>,
        title: twoLines,
        line: <SkeletonLine width={skeletonWidth(row, column * 7, 10)} />,
        pill: <SkeletonPill width={PILL_WIDTHS[(row + column) % PILL_WIDTHS.length]} />,
        number: <SkeletonNumber width={NUMBER_WIDTHS[(row + column) % NUMBER_WIDTHS.length]} />,
        none: null,
    }[kind];
    return <div className="min-h-[34px] flex items-center">{content}</div>;
};

/** Las filas de la primera carga: cada celda con la forma de su columna. */
export function TableSkeletonRows<T>({ columns, hasSelection, rowCount = 9 }: {
    columns: ColumnDef<T>[];
    hasSelection: boolean;
    rowCount?: number;
}) {
    return Array.from({ length: rowCount }, (_, row) => (
        <tr key={row}>
            {hasSelection && <td className={CHECK_CELL_CLASS} />}
            {columns.map((column, i) => (
                <td key={column.id ?? i} className={CELL_CLASS}>
                    <SkeletonCell kind={column.meta?.skeleton ?? 'line'} row={row} column={i} />
                </td>
            ))}
        </tr>
    ));
}

/**
 * La barra fina de cuando ya hay filas y se piden otras (página, filtro,
 * «Sincronizar»). Con «reducir movimiento» se queda quieta.
 */
export const TableLoadingBar = () => (
    <div aria-hidden className="h-0.5 bg-brand-accent-soft overflow-hidden">
        <div className="h-full w-[30%] bg-brand-success motion-safe:animate-loading-bar" />
    </div>
);
